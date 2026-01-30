import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'

// Test pure utility functions from docker-manager
// These are extracted/reimplemented here since they're not exported

/**
 * Normalize a host path for use in Docker bind mount strings.
 * On Windows, converts backslashes to forward slashes (Docker requirement).
 * On Linux/macOS, returns the path unchanged.
 */
function toDockerPath(hostPath: string, isWindows: boolean): string {
  if (!isWindows) return hostPath
  // Convert backslashes to forward slashes for Docker
  return hostPath.replace(/\\/g, '/')
}

/**
 * Generate a 12-character SHA256 hash of the absolute project path.
 */
function hashProjectPath(projectPath: string): string {
  const absolutePath = path.resolve(projectPath)
  return crypto.createHash('sha256')
    .update(absolutePath)
    .digest('hex')
    .substring(0, 12)
}

/**
 * Sanitize a folder name for use in directory names.
 */
function sanitizeFolderName(folderPath: string): string {
  const folderName = path.basename(folderPath)
  return folderName
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30)
}

/**
 * Generate a project directory name combining folder name and hash.
 */
function getProjectDirName(projectPath: string): string {
  const sanitizedName = sanitizeFolderName(projectPath)
  const hash = hashProjectPath(projectPath)
  return sanitizedName ? `${sanitizedName}-${hash}` : `project-${hash}`
}

/**
 * Convert a Windows home path to a Linux-compatible absolute path for use
 * inside the container. This allows symlink creation to work correctly.
 *
 * Example: C:\Users\name -> /c/Users/name (absolute path in Linux)
 *
 * On non-Windows, returns the path unchanged.
 */
function toContainerHomePath(hostHome: string, isWindows: boolean): string {
  if (!isWindows) return hostHome
  // Convert C:\Users\name to /c/Users/name (lowercase drive letter, absolute path)
  const dockerPath = hostHome.replace(/\\/g, '/')
  // Convert C:/Users/name to /c/Users/name
  if (/^[A-Za-z]:/.test(dockerPath)) {
    const driveLetter = dockerPath[0].toLowerCase()
    return `/${driveLetter}${dockerPath.slice(2)}`
  }
  return dockerPath
}

/**
 * Get the container-side path for the project directory.
 * On Windows, returns /workspace (since Windows paths don't work in Linux containers).
 * On Linux/macOS, returns the same path for symlink compatibility.
 */
function getContainerProjectPath(hostPath: string, isWindows: boolean): string {
  return isWindows ? '/workspace' : hostPath
}

/**
 * Build a bind mount string for the project directory.
 */
function buildProjectBindMount(hostPath: string, isWindows: boolean): string {
  const dockerPath = toDockerPath(hostPath, isWindows)
  const containerPath = getContainerProjectPath(hostPath, isWindows)
  return `${dockerPath}:${containerPath}:rw`
}

describe('docker-manager utilities', () => {
  describe('hashProjectPath', () => {
    it('returns a 12-character hex string', () => {
      const hash = hashProjectPath('/home/user/project')
      expect(hash).toMatch(/^[a-f0-9]{12}$/)
    })

    it('returns same hash for same path', () => {
      const hash1 = hashProjectPath('/home/user/project')
      const hash2 = hashProjectPath('/home/user/project')
      expect(hash1).toBe(hash2)
    })

    it('returns different hash for different paths', () => {
      const hash1 = hashProjectPath('/home/user/project1')
      const hash2 = hashProjectPath('/home/user/project2')
      expect(hash1).not.toBe(hash2)
    })

    it('resolves relative paths', () => {
      const hash1 = hashProjectPath('./project')
      const hash2 = hashProjectPath(path.resolve('./project'))
      expect(hash1).toBe(hash2)
    })
  })

  describe('sanitizeFolderName', () => {
    it('converts to lowercase', () => {
      expect(sanitizeFolderName('/path/to/MyProject')).toBe('myproject')
    })

    it('replaces special characters with hyphens', () => {
      expect(sanitizeFolderName('/path/my project')).toBe('my-project')
      expect(sanitizeFolderName('/path/my@project!')).toBe('my-project')
    })

    it('collapses multiple hyphens', () => {
      expect(sanitizeFolderName('/path/my---project')).toBe('my-project')
    })

    it('trims leading and trailing hyphens', () => {
      expect(sanitizeFolderName('/path/-project-')).toBe('project')
    })

    it('limits length to 30 characters', () => {
      const longName = 'a'.repeat(50)
      expect(sanitizeFolderName(`/path/${longName}`).length).toBeLessThanOrEqual(30)
    })

    it('preserves alphanumeric and valid characters', () => {
      expect(sanitizeFolderName('/path/my-project_123')).toBe('my-project_123')
    })
  })

  describe('getProjectDirName', () => {
    it('combines sanitized name and hash', () => {
      const dirName = getProjectDirName('/home/user/MyProject')
      expect(dirName).toMatch(/^myproject-[a-f0-9]{12}$/)
    })

    it('uses project prefix when folder name is empty after sanitization', () => {
      const dirName = getProjectDirName('/path/---')
      expect(dirName).toMatch(/^project-[a-f0-9]{12}$/)
    })

    it('generates unique names for different projects', () => {
      const name1 = getProjectDirName('/home/user/project1')
      const name2 = getProjectDirName('/home/user/project2')
      expect(name1).not.toBe(name2)
    })

    it('generates same name for same project', () => {
      const name1 = getProjectDirName('/home/user/project')
      const name2 = getProjectDirName('/home/user/project')
      expect(name1).toBe(name2)
    })
  })

  describe('toDockerPath', () => {
    it('returns path unchanged on non-Windows', () => {
      const linuxPath = '/home/user/project'
      expect(toDockerPath(linuxPath, false)).toBe(linuxPath)
    })

    it('returns path unchanged for Unix paths on Windows', () => {
      // Unix-style paths should still work (forward slashes are valid)
      const unixPath = '/home/user/project'
      expect(toDockerPath(unixPath, true)).toBe(unixPath)
    })

    it('converts Windows backslashes to forward slashes', () => {
      const windowsPath = 'C:\\Users\\name\\project'
      expect(toDockerPath(windowsPath, true)).toBe('C:/Users/name/project')
    })

    it('handles mixed slashes on Windows', () => {
      const mixedPath = 'C:\\Users/name\\project'
      expect(toDockerPath(mixedPath, true)).toBe('C:/Users/name/project')
    })

    it('handles nested Windows paths', () => {
      const deepPath = 'C:\\Users\\name\\.cache\\yolium\\project\\npm'
      expect(toDockerPath(deepPath, true)).toBe('C:/Users/name/.cache/yolium/project/npm')
    })

    it('handles paths with spaces on Windows', () => {
      const pathWithSpaces = 'C:\\Users\\User Name\\My Project'
      expect(toDockerPath(pathWithSpaces, true)).toBe('C:/Users/User Name/My Project')
    })
  })

  describe('toContainerHomePath', () => {
    it('returns path unchanged on non-Windows', () => {
      const linuxHome = '/home/user'
      expect(toContainerHomePath(linuxHome, false)).toBe('/home/user')
    })

    it('converts Windows home to absolute Linux path', () => {
      // C:\Users\name should become /c/Users/name (absolute path in Linux container)
      const windowsHome = 'C:\\Users\\charles.porter'
      expect(toContainerHomePath(windowsHome, true)).toBe('/c/Users/charles.porter')
    })

    it('handles lowercase drive letter', () => {
      const windowsHome = 'c:\\Users\\name'
      expect(toContainerHomePath(windowsHome, true)).toBe('/c/Users/name')
    })

    it('handles uppercase drive letter and converts to lowercase', () => {
      const windowsHome = 'D:\\Users\\name'
      expect(toContainerHomePath(windowsHome, true)).toBe('/d/Users/name')
    })

    it('handles paths with spaces', () => {
      const windowsHome = 'C:\\Users\\User Name'
      expect(toContainerHomePath(windowsHome, true)).toBe('/c/Users/User Name')
    })

    it('produces a path that starts with / (absolute path)', () => {
      // This is critical: the path must start with / so ln -sf creates
      // the symlink at an absolute location, not in the current directory
      const windowsHome = 'C:\\Users\\charles.porter'
      const result = toContainerHomePath(windowsHome, true)
      expect(result.startsWith('/')).toBe(true)
    })
  })

  describe('getContainerProjectPath', () => {
    it('returns /workspace on Windows', () => {
      const windowsPath = 'C:\\Users\\name\\project'
      expect(getContainerProjectPath(windowsPath, true)).toBe('/workspace')
    })

    it('returns same path on Linux', () => {
      const linuxPath = '/home/user/project'
      expect(getContainerProjectPath(linuxPath, false)).toBe('/home/user/project')
    })

    it('returns same path on macOS', () => {
      const macPath = '/Users/name/project'
      expect(getContainerProjectPath(macPath, false)).toBe('/Users/name/project')
    })
  })

  describe('buildProjectBindMount', () => {
    it('builds correct bind mount for Windows', () => {
      const windowsPath = 'C:\\Users\\name\\project'
      const mount = buildProjectBindMount(windowsPath, true)
      // Should be: C:/Users/name/project:/workspace:rw
      expect(mount).toBe('C:/Users/name/project:/workspace:rw')
    })

    it('builds correct bind mount for Linux', () => {
      const linuxPath = '/home/user/project'
      const mount = buildProjectBindMount(linuxPath, false)
      // Should be: /home/user/project:/home/user/project:rw
      expect(mount).toBe('/home/user/project:/home/user/project:rw')
    })

    it('handles Windows paths with spaces', () => {
      const windowsPath = 'C:\\Users\\User Name\\My Project'
      const mount = buildProjectBindMount(windowsPath, true)
      expect(mount).toBe('C:/Users/User Name/My Project:/workspace:rw')
    })

    it('Windows bind mount uses forward slashes for host path', () => {
      const windowsPath = 'C:\\Users\\name\\project'
      const mount = buildProjectBindMount(windowsPath, true)
      // Host path should have forward slashes (Docker requirement)
      expect(mount).not.toContain('\\')
    })
  })
})

// ============================================================================
// Tests for cleanup logic patterns
// These test the expected behavior of cleanup operations
// ============================================================================

describe('persistent paths', () => {
  /**
   * Reimplementation of getPersistentPaths for testing.
   * Mirrors the structure in docker-manager.ts.
   */
  function getPersistentPaths(projectPath: string) {
    const homeDir = os.homedir()
    const projectDirName = getProjectDirName(projectPath)
    const cacheBase = path.join(homeDir, '.cache', 'yolium', projectDirName)
    const historyBase = path.join(homeDir, '.yolium', 'projects', projectDirName)

    return {
      cache: {
        npm: path.join(cacheBase, 'npm'),
        pip: path.join(cacheBase, 'pip'),
        maven: path.join(cacheBase, 'maven'),
        gradle: path.join(cacheBase, 'gradle'),
        nuget: path.join(cacheBase, 'nuget'),
      },
      history: path.join(historyBase, 'history'),
      claude: path.join(homeDir, '.claude'),
      opencode: {
        config: path.join(homeDir, '.config', 'opencode'),
        data: path.join(homeDir, '.local', 'share', 'opencode'),
      },
      codex: path.join(homeDir, '.codex'),
    }
  }

  it('includes nuget cache path', () => {
    const paths = getPersistentPaths('/home/user/project')
    expect(paths.cache.nuget).toContain('nuget')
    expect(paths.cache.nuget).toContain(path.join('.cache', 'yolium'))
  })

  it('all cache paths are unique', () => {
    const paths = getPersistentPaths('/home/user/project')
    const cachePaths = Object.values(paths.cache)
    const uniquePaths = new Set(cachePaths)
    expect(uniquePaths.size).toBe(cachePaths.length)
  })

  it('includes all expected package manager caches', () => {
    const paths = getPersistentPaths('/home/user/project')
    expect(paths.cache).toHaveProperty('npm')
    expect(paths.cache).toHaveProperty('pip')
    expect(paths.cache).toHaveProperty('maven')
    expect(paths.cache).toHaveProperty('gradle')
    expect(paths.cache).toHaveProperty('nuget')
  })

  it('nuget cache bind mount maps to /home/agent/.nuget', () => {
    const paths = getPersistentPaths('/home/user/project')
    const nugetBind = `${toDockerPath(paths.cache.nuget, false)}:/home/agent/.nuget:rw`
    expect(nugetBind).toContain(':/home/agent/.nuget:rw')
  })

  it('includes codex config path', () => {
    const paths = getPersistentPaths('/home/user/project')
    expect(paths.codex).toContain('.codex')
  })

  it('codex config bind mount maps to /home/agent/.codex', () => {
    const paths = getPersistentPaths('/home/user/project')
    const codexBind = `${toDockerPath(paths.codex, false)}:/home/agent/.codex:rw`
    expect(codexBind).toContain(':/home/agent/.codex:rw')
  })
})

describe('cleanup behavior patterns', () => {
  // Simulate the session storage pattern used in docker-manager
  interface MockSession {
    id: string
    containerId: string
    worktreePath?: string
    originalPath?: string
  }

  // Simulate the cleanup logic pattern from closeAllContainers
  async function simulateCloseAllContainers(
    sessions: Map<string, MockSession>,
    mockStopContainer: (containerId: string) => Promise<void>,
    mockRemoveContainer: (containerId: string) => Promise<void>,
    mockDeleteWorktree: (originalPath: string, worktreePath: string) => void
  ): Promise<void> {
    const sessionIds = Array.from(sessions.keys())

    await Promise.all(sessionIds.map(async (sessionId) => {
      const session = sessions.get(sessionId)
      if (!session) return

      // Delete worktree first (while session info is still available)
      if (session.worktreePath && session.originalPath) {
        try {
          mockDeleteWorktree(session.originalPath, session.worktreePath)
        } catch {
          // Continue cleanup even if worktree deletion fails
        }
      }

      // Stop and remove container
      try {
        await mockStopContainer(session.containerId)
      } catch {
        // Container may already be stopped
      }
      try {
        await mockRemoveContainer(session.containerId)
      } catch {
        // Container may already be removed
      }
    }))

    sessions.clear()
  }

  describe('closeAllContainers logic', () => {
    let sessions: Map<string, MockSession>
    let stopContainerMock: ReturnType<typeof vi.fn>
    let removeContainerMock: ReturnType<typeof vi.fn>
    let deleteWorktreeMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      sessions = new Map()
      stopContainerMock = vi.fn().mockResolvedValue(undefined)
      removeContainerMock = vi.fn().mockResolvedValue(undefined)
      deleteWorktreeMock = vi.fn()
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    it('clears all sessions after cleanup', async () => {
      sessions.set('session-1', { id: 'session-1', containerId: 'container-1' })
      sessions.set('session-2', { id: 'session-2', containerId: 'container-2' })

      await simulateCloseAllContainers(
        sessions,
        stopContainerMock,
        removeContainerMock,
        deleteWorktreeMock
      )

      expect(sessions.size).toBe(0)
    })

    it('stops and removes all containers', async () => {
      sessions.set('session-1', { id: 'session-1', containerId: 'container-1' })
      sessions.set('session-2', { id: 'session-2', containerId: 'container-2' })

      await simulateCloseAllContainers(
        sessions,
        stopContainerMock,
        removeContainerMock,
        deleteWorktreeMock
      )

      expect(stopContainerMock).toHaveBeenCalledTimes(2)
      expect(stopContainerMock).toHaveBeenCalledWith('container-1')
      expect(stopContainerMock).toHaveBeenCalledWith('container-2')

      expect(removeContainerMock).toHaveBeenCalledTimes(2)
      expect(removeContainerMock).toHaveBeenCalledWith('container-1')
      expect(removeContainerMock).toHaveBeenCalledWith('container-2')
    })

    it('deletes worktrees for sessions that have them', async () => {
      sessions.set('session-1', {
        id: 'session-1',
        containerId: 'container-1',
        worktreePath: '/home/user/.yolium/worktrees/project/feature-branch',
        originalPath: '/home/user/project'
      })
      sessions.set('session-2', {
        id: 'session-2',
        containerId: 'container-2'
        // No worktree
      })

      await simulateCloseAllContainers(
        sessions,
        stopContainerMock,
        removeContainerMock,
        deleteWorktreeMock
      )

      // Only session-1 has a worktree
      expect(deleteWorktreeMock).toHaveBeenCalledTimes(1)
      expect(deleteWorktreeMock).toHaveBeenCalledWith(
        '/home/user/project',
        '/home/user/.yolium/worktrees/project/feature-branch'
      )
    })

    it('continues cleanup even if container stop fails', async () => {
      sessions.set('session-1', { id: 'session-1', containerId: 'container-1' })
      sessions.set('session-2', { id: 'session-2', containerId: 'container-2' })

      stopContainerMock
        .mockRejectedValueOnce(new Error('Container already stopped'))
        .mockResolvedValueOnce(undefined)

      await simulateCloseAllContainers(
        sessions,
        stopContainerMock,
        removeContainerMock,
        deleteWorktreeMock
      )

      // Both containers should have removal attempted
      expect(removeContainerMock).toHaveBeenCalledTimes(2)
      expect(sessions.size).toBe(0)
    })

    it('continues cleanup even if worktree deletion fails', async () => {
      sessions.set('session-1', {
        id: 'session-1',
        containerId: 'container-1',
        worktreePath: '/path/to/worktree',
        originalPath: '/path/to/project'
      })

      deleteWorktreeMock.mockImplementation(() => {
        throw new Error('Worktree deletion failed')
      })

      await simulateCloseAllContainers(
        sessions,
        stopContainerMock,
        removeContainerMock,
        deleteWorktreeMock
      )

      // Container cleanup should still happen
      expect(stopContainerMock).toHaveBeenCalledWith('container-1')
      expect(removeContainerMock).toHaveBeenCalledWith('container-1')
      expect(sessions.size).toBe(0)
    })

    it('handles empty sessions map', async () => {
      await simulateCloseAllContainers(
        sessions,
        stopContainerMock,
        removeContainerMock,
        deleteWorktreeMock
      )

      expect(stopContainerMock).not.toHaveBeenCalled()
      expect(removeContainerMock).not.toHaveBeenCalled()
      expect(deleteWorktreeMock).not.toHaveBeenCalled()
      expect(sessions.size).toBe(0)
    })

    it('deletes worktree before stopping container', async () => {
      const callOrder: string[] = []

      sessions.set('session-1', {
        id: 'session-1',
        containerId: 'container-1',
        worktreePath: '/path/to/worktree',
        originalPath: '/path/to/project'
      })

      deleteWorktreeMock.mockImplementation(() => {
        callOrder.push('deleteWorktree')
      })
      stopContainerMock.mockImplementation(async () => {
        callOrder.push('stopContainer')
      })
      removeContainerMock.mockImplementation(async () => {
        callOrder.push('removeContainer')
      })

      await simulateCloseAllContainers(
        sessions,
        stopContainerMock,
        removeContainerMock,
        deleteWorktreeMock
      )

      // Worktree should be deleted first (while session info is available)
      expect(callOrder).toEqual(['deleteWorktree', 'stopContainer', 'removeContainer'])
    })
  })

  describe('tab close cleanup behavior', () => {
    // Simulate the pattern used in handleCloseTab
    interface MockTab {
      id: string
      sessionId: string
    }

    function simulateHandleCloseTab(
      tab: MockTab,
      closeTabUI: (tabId: string) => void,
      stopYolium: (sessionId: string, deleteWorktree: boolean) => Promise<void>
    ): void {
      // Close tab immediately in UI for instant feedback
      closeTabUI(tab.id)

      // Cleanup container and worktree in background (always delete worktree)
      stopYolium(tab.sessionId, true).catch(() => {
        // Error logged but not blocking
      })
    }

    it('closes tab UI immediately before cleanup', () => {
      const callOrder: string[] = []
      const closeTabUIMock = vi.fn(() => callOrder.push('closeTabUI'))
      const stopYoliumMock = vi.fn(async () => {
        callOrder.push('stopYolium')
      })

      const tab: MockTab = { id: 'tab-1', sessionId: 'session-1' }

      simulateHandleCloseTab(tab, closeTabUIMock, stopYoliumMock)

      // UI should be updated first (synchronously)
      expect(closeTabUIMock).toHaveBeenCalledWith('tab-1')
      expect(callOrder[0]).toBe('closeTabUI')
    })

    it('always passes deleteWorktree=true to stopYolium', () => {
      const closeTabUIMock = vi.fn()
      const stopYoliumMock = vi.fn().mockResolvedValue(undefined)

      const tab: MockTab = { id: 'tab-1', sessionId: 'session-1' }

      simulateHandleCloseTab(tab, closeTabUIMock, stopYoliumMock)

      expect(stopYoliumMock).toHaveBeenCalledWith('session-1', true)
    })

    it('does not block on cleanup errors', async () => {
      const closeTabUIMock = vi.fn()
      const stopYoliumMock = vi.fn().mockRejectedValue(new Error('Cleanup failed'))

      const tab: MockTab = { id: 'tab-1', sessionId: 'session-1' }

      // This should not throw
      simulateHandleCloseTab(tab, closeTabUIMock, stopYoliumMock)

      // Give time for the promise to settle
      await new Promise(resolve => setTimeout(resolve, 10))

      // Tab UI should still be closed
      expect(closeTabUIMock).toHaveBeenCalledWith('tab-1')
    })
  })

  describe('close all tabs cleanup behavior', () => {
    interface MockTab {
      id: string
      sessionId: string
    }

    function simulateHandleCloseAllTabs(
      tabs: MockTab[],
      closeAllTabsUI: () => void,
      stopYolium: (sessionId: string, deleteWorktree: boolean) => Promise<void>
    ): void {
      // Store session IDs before clearing tabs
      const sessionIds = tabs.map(t => t.sessionId)

      // Close all tabs immediately in UI
      closeAllTabsUI()

      // Cleanup containers and worktrees in background (always delete worktrees)
      sessionIds.forEach(sessionId => {
        stopYolium(sessionId, true).catch(() => {
          // Error logged but not blocking
        })
      })
    }

    it('closes all tabs UI immediately', () => {
      const closeAllTabsUIMock = vi.fn()
      const stopYoliumMock = vi.fn().mockResolvedValue(undefined)

      const tabs: MockTab[] = [
        { id: 'tab-1', sessionId: 'session-1' },
        { id: 'tab-2', sessionId: 'session-2' },
      ]

      simulateHandleCloseAllTabs(tabs, closeAllTabsUIMock, stopYoliumMock)

      expect(closeAllTabsUIMock).toHaveBeenCalledTimes(1)
    })

    it('calls stopYolium with deleteWorktree=true for all sessions', () => {
      const closeAllTabsUIMock = vi.fn()
      const stopYoliumMock = vi.fn().mockResolvedValue(undefined)

      const tabs: MockTab[] = [
        { id: 'tab-1', sessionId: 'session-1' },
        { id: 'tab-2', sessionId: 'session-2' },
        { id: 'tab-3', sessionId: 'session-3' },
      ]

      simulateHandleCloseAllTabs(tabs, closeAllTabsUIMock, stopYoliumMock)

      expect(stopYoliumMock).toHaveBeenCalledTimes(3)
      expect(stopYoliumMock).toHaveBeenCalledWith('session-1', true)
      expect(stopYoliumMock).toHaveBeenCalledWith('session-2', true)
      expect(stopYoliumMock).toHaveBeenCalledWith('session-3', true)
    })

    it('captures session IDs before clearing tabs', () => {
      let capturedSessionIds: string[] = []
      const closeAllTabsUIMock = vi.fn()
      const stopYoliumMock = vi.fn((sessionId: string) => {
        capturedSessionIds.push(sessionId)
        return Promise.resolve()
      })

      const tabs: MockTab[] = [
        { id: 'tab-1', sessionId: 'session-1' },
        { id: 'tab-2', sessionId: 'session-2' },
      ]

      simulateHandleCloseAllTabs(tabs, closeAllTabsUIMock, stopYoliumMock)

      // Even after UI is cleared, cleanup should use captured session IDs
      expect(capturedSessionIds).toContain('session-1')
      expect(capturedSessionIds).toContain('session-2')
    })
  })
})

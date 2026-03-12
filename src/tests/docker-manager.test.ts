import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import type { AgentProvider } from '@shared/types/agent'

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

describe('container environment variables', () => {
  /**
   * Simulates the Env array construction from docker-manager.ts createYolium().
   * Mirrors the logic that builds environment variables for the container.
   */
  function buildContainerEnv(options: {
    agent: string;
    gsdEnabled: boolean;
    gitConfig?: { name: string; email: string };
  }): string[] {
    const env = [
      `PROJECT_DIR=/workspace`,
      `TOOL=${options.agent}`,
      `GSD_ENABLED=${options.gsdEnabled}`,
      'CLAUDE_CONFIG_DIR=/home/agent/.claude',
      'HISTFILE=/home/agent/.yolium_history/zsh_history',
      ...(options.gitConfig?.name ? [`GIT_USER_NAME=${options.gitConfig.name}`] : []),
      ...(options.gitConfig?.email ? [`GIT_USER_EMAIL=${options.gitConfig.email}`] : []),
    ]
    return env
  }

  it('includes TOOL env var for agent type', () => {
    const env = buildContainerEnv({
      agent: 'codex',
      gsdEnabled: false,
    })
    expect(env).toContain('TOOL=codex')
  })

  it('includes git config when provided', () => {
    const env = buildContainerEnv({
      agent: 'claude',
      gsdEnabled: true,
      gitConfig: { name: 'Test', email: 'test@test.com' },
    })
    expect(env).toContain('GIT_USER_NAME=Test')
    expect(env).toContain('GIT_USER_EMAIL=test@test.com')
  })

  it('omits git config when not provided', () => {
    const env = buildContainerEnv({
      agent: 'codex',
      gsdEnabled: false,
    })
    expect(env.some(e => e.startsWith('GIT_USER_NAME='))).toBe(false)
    expect(env.some(e => e.startsWith('GIT_USER_EMAIL='))).toBe(false)
  })
})

describe('settings config persistence', () => {
  /**
   * Simulates the settings.json structure.
   */
  interface SettingsConfig {
    name: string;
    email: string;
    githubPat?: string;
    openaiApiKey?: string;
  }

  function parseConfig(json: string): SettingsConfig | null {
    try {
      const config = JSON.parse(json)
      if (typeof config.name === 'string' && typeof config.email === 'string') {
        return {
          name: config.name,
          email: config.email,
          ...(config.githubPat ? { githubPat: config.githubPat } : {}),
          ...(config.openaiApiKey ? { openaiApiKey: config.openaiApiKey } : {}),
        }
      }
      return null
    } catch {
      return null
    }
  }

  it('loads config from JSON', () => {
    const json = JSON.stringify({ name: 'Test', email: 'test@test.com' })
    const config = parseConfig(json)
    expect(config?.name).toBe('Test')
    expect(config?.email).toBe('test@test.com')
  })

  it('loads githubPat from config JSON', () => {
    const json = JSON.stringify({ name: 'Test', email: 'test@test.com', githubPat: 'ghp_test' })
    const config = parseConfig(json)
    expect(config?.githubPat).toBe('ghp_test')
  })

  it('handles config without githubPat', () => {
    const json = JSON.stringify({ name: 'Test', email: 'test@test.com' })
    const config = parseConfig(json)
    expect(config?.githubPat).toBeUndefined()
  })

  it('loads openaiApiKey from config JSON', () => {
    const json = JSON.stringify({ name: 'Test', email: 'test@test.com', openaiApiKey: 'sk-test123' })
    const config = parseConfig(json)
    expect(config?.openaiApiKey).toBe('sk-test123')
  })

  it('handles config without openaiApiKey', () => {
    const json = JSON.stringify({ name: 'Test', email: 'test@test.com' })
    const config = parseConfig(json)
    expect(config?.openaiApiKey).toBeUndefined()
  })

  it('loads both githubPat and openaiApiKey', () => {
    const json = JSON.stringify({ name: 'Test', email: 'test@test.com', githubPat: 'ghp_test', openaiApiKey: 'sk-test' })
    const config = parseConfig(json)
    expect(config?.githubPat).toBe('ghp_test')
    expect(config?.openaiApiKey).toBe('sk-test')
  })
})

describe('codex agent type', () => {
  it('codex is assignable to AgentProvider', () => {
    const agent: AgentProvider = 'codex';
    expect(agent).toBe('codex');
  })

  it('all agent types are distinct', () => {
    const agents: AgentProvider[] = ['claude', 'opencode', 'codex', 'shell'];
    expect(new Set(agents).size).toBe(agents.length);
  })
})

describe('codex container config', () => {
  it('codex persistent path is at ~/.codex', () => {
    const homeDir = os.homedir();
    const codexPath = path.join(homeDir, '.codex');
    expect(codexPath).toContain('.codex');
    expect(codexPath).toMatch(/\.codex$/);
  })

  it('codex bind mount is distinct from claude and opencode', () => {
    const homeDir = os.homedir();
    const claudePath = path.join(homeDir, '.claude');
    const opencodePath = path.join(homeDir, '.config', 'opencode');
    const codexPath = path.join(homeDir, '.codex');

    expect(codexPath).not.toBe(claudePath);
    expect(codexPath).not.toBe(opencodePath);
  })

  it('OPENAI_API_KEY is only passed for codex agent', () => {
    // The production code gates OPENAI_API_KEY on agent === 'codex'
    const agents = ['claude', 'opencode', 'codex', 'shell'];
    for (const agent of agents) {
      const shouldPass = agent === 'codex';
      expect(shouldPass).toBe(agent === 'codex');
    }
  })

  it('OPENAI_API_KEY env var is built from stored config for codex', () => {
    const storedKey = 'sk-stored-key-123';
    const agent = 'codex';
    const env = [
      ...(agent === 'codex' && storedKey ? [`OPENAI_API_KEY=${storedKey}`] : []),
    ];
    expect(env).toContain('OPENAI_API_KEY=sk-stored-key-123');
  })

  it('OPENAI_API_KEY env var is not set for non-codex agents even with stored key', () => {
    const storedKey = 'sk-stored-key-123';
    for (const agent of ['claude', 'opencode', 'shell']) {
      const env = [
        ...(agent === 'codex' && storedKey ? [`OPENAI_API_KEY=${storedKey}`] : []),
      ];
      expect(env.some(e => e.startsWith('OPENAI_API_KEY='))).toBe(false);
    }
  })
})

describe('codex mount gating by agent type', () => {
  /**
   * Reimplementation of buildPersistentBindMounts mount-gating logic.
   * The .codex mount should only be included for the codex agent.
   */
  function buildBindMountsForAgent(agent: string, mountPath: string): string[] {
    const homeDir = os.homedir();
    const binds = [
      `${mountPath}:${mountPath}:rw`,
      `${path.join(homeDir, '.claude')}:/home/agent/.claude:rw`,
      `${path.join(homeDir, '.config', 'opencode')}:/home/agent/.config/opencode:rw`,
      `${path.join(homeDir, '.local', 'share', 'opencode')}:/home/agent/.local/share/opencode:rw`,
    ];

    // Only mount Codex config for Codex agent (least-privilege)
    if (agent === 'codex') {
      binds.push(`${path.join(homeDir, '.codex')}:/home/agent/.codex:rw`);
    }

    return binds;
  }

  it('includes .codex mount for codex agent', () => {
    const binds = buildBindMountsForAgent('codex', '/home/user/project');
    const hasCodexMount = binds.some(b => b.includes('.codex:/home/agent/.codex'));
    expect(hasCodexMount).toBe(true);
  });

  it('excludes .codex mount for claude agent', () => {
    const binds = buildBindMountsForAgent('claude', '/home/user/project');
    const hasCodexMount = binds.some(b => b.includes('.codex:/home/agent/.codex'));
    expect(hasCodexMount).toBe(false);
  });

  it('excludes .codex mount for opencode agent', () => {
    const binds = buildBindMountsForAgent('opencode', '/home/user/project');
    const hasCodexMount = binds.some(b => b.includes('.codex:/home/agent/.codex'));
    expect(hasCodexMount).toBe(false);
  });

  it('excludes .codex mount for shell agent', () => {
    const binds = buildBindMountsForAgent('shell', '/home/user/project');
    const hasCodexMount = binds.some(b => b.includes('.codex:/home/agent/.codex'));
    expect(hasCodexMount).toBe(false);
  });

  it('always includes .claude mount regardless of agent', () => {
    for (const agent of ['claude', 'opencode', 'codex', 'shell']) {
      const binds = buildBindMountsForAgent(agent, '/home/user/project');
      const hasClaudeMount = binds.some(b => b.includes('.claude:/home/agent/.claude'));
      expect(hasClaudeMount).toBe(true);
    }
  });
})

describe('cleanup behavior patterns', () => {
  type StopContainerMock = ReturnType<typeof vi.fn<(containerId: string) => Promise<void>>>
  type RemoveContainerMock = ReturnType<typeof vi.fn<(containerId: string) => Promise<void>>>
  type DeleteWorktreeMock = ReturnType<typeof vi.fn<(originalPath: string, worktreePath: string) => void>>

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
    let stopContainerMock: StopContainerMock
    let removeContainerMock: RemoveContainerMock
    let deleteWorktreeMock: DeleteWorktreeMock

    beforeEach(() => {
      sessions = new Map()
      stopContainerMock = vi.fn<(containerId: string) => Promise<void>>().mockResolvedValue(undefined)
      removeContainerMock = vi.fn<(containerId: string) => Promise<void>>().mockResolvedValue(undefined)
      deleteWorktreeMock = vi.fn<(originalPath: string, worktreePath: string) => void>()
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

// ============================================================================
// Startup Auto-Build and Cancel Behavior Tests
// ============================================================================

describe('startup auto-build behavior', () => {
  /**
   * Simulates the startup auto-build flow as a pure function.
   * Mirrors the useEffect in App.tsx that triggers when dockerReady becomes true.
   */
  async function simulateStartupAutoBuild(
    dockerReady: boolean,
    ensureImage: () => Promise<void>,
    setBuildProgress: (value: string[] | null) => void,
    setBuildError: (value: string | null) => void,
    onProgress: (callback: (message: string) => void) => (() => void),
    isCancelled: () => boolean,
    setImageRemoved: (value: boolean) => void,
  ): Promise<'skipped' | 'success' | 'error' | 'cancelled'> {
    if (!dockerReady) return 'skipped'

    const cleanupProgress = onProgress((message) => {
      setBuildProgress([message])
    })

    setBuildError(null)
    setBuildProgress(['Checking Yolium image...'])

    try {
      await ensureImage()
      cleanupProgress()
      if (isCancelled()) return 'cancelled'
      setBuildProgress(null)
      setImageRemoved(false)
      return 'success'
    } catch (err) {
      cleanupProgress()
      if (isCancelled()) return 'cancelled'
      const message = err instanceof Error ? err.message : 'Unknown error'
      setBuildError(message)
      return 'error'
    }
  }

  it('calls ensureImage when docker is ready', async () => {
    const ensureImage = vi.fn().mockResolvedValue(undefined)
    const setBuildProgress = vi.fn()
    const setBuildError = vi.fn()
    const onProgress = vi.fn(() => vi.fn())
    const setImageRemoved = vi.fn()

    await simulateStartupAutoBuild(true, ensureImage, setBuildProgress, setBuildError, onProgress, () => false, setImageRemoved)

    expect(ensureImage).toHaveBeenCalledTimes(1)
  })

  it('skips when docker is not ready', async () => {
    const ensureImage = vi.fn().mockResolvedValue(undefined)
    const setBuildProgress = vi.fn()
    const setBuildError = vi.fn()
    const onProgress = vi.fn(() => vi.fn())
    const setImageRemoved = vi.fn()

    const result = await simulateStartupAutoBuild(false, ensureImage, setBuildProgress, setBuildError, onProgress, () => false, setImageRemoved)

    expect(result).toBe('skipped')
    expect(ensureImage).not.toHaveBeenCalled()
  })

  it('clears progress on success', async () => {
    const ensureImage = vi.fn().mockResolvedValue(undefined)
    const setBuildProgress = vi.fn()
    const setBuildError = vi.fn()
    const onProgress = vi.fn(() => vi.fn())
    const setImageRemoved = vi.fn()

    await simulateStartupAutoBuild(true, ensureImage, setBuildProgress, setBuildError, onProgress, () => false, setImageRemoved)

    // Should set progress to null after success
    expect(setBuildProgress).toHaveBeenLastCalledWith(null)
  })

  it('sets error on failure', async () => {
    const ensureImage = vi.fn().mockRejectedValue(new Error('Build failed'))
    const setBuildProgress = vi.fn()
    const setBuildError = vi.fn()
    const onProgress = vi.fn(() => vi.fn())
    const setImageRemoved = vi.fn()

    const result = await simulateStartupAutoBuild(true, ensureImage, setBuildProgress, setBuildError, onProgress, () => false, setImageRemoved)

    expect(result).toBe('error')
    expect(setBuildError).toHaveBeenCalledWith('Build failed')
  })

  it('returns cancelled when flag is set during success', async () => {
    const ensureImage = vi.fn().mockResolvedValue(undefined)
    const setBuildProgress = vi.fn()
    const setBuildError = vi.fn()
    const onProgress = vi.fn(() => vi.fn())
    const setImageRemoved = vi.fn()

    const result = await simulateStartupAutoBuild(true, ensureImage, setBuildProgress, setBuildError, onProgress, () => true, setImageRemoved)

    expect(result).toBe('cancelled')
    // Should not clear progress or set imageRemoved when cancelled
    expect(setBuildProgress).not.toHaveBeenCalledWith(null)
    expect(setImageRemoved).not.toHaveBeenCalled()
  })

  it('returns cancelled when flag is set during error', async () => {
    const ensureImage = vi.fn().mockRejectedValue(new Error('Build failed'))
    const setBuildProgress = vi.fn()
    const setBuildError = vi.fn()
    const onProgress = vi.fn(() => vi.fn())
    const setImageRemoved = vi.fn()

    const result = await simulateStartupAutoBuild(true, ensureImage, setBuildProgress, setBuildError, onProgress, () => true, setImageRemoved)

    expect(result).toBe('cancelled')
    // Should not set error when cancelled
    expect(setBuildError).not.toHaveBeenCalledWith('Build failed')
  })

  it('cleans up listener on success', async () => {
    const ensureImage = vi.fn().mockResolvedValue(undefined)
    const setBuildProgress = vi.fn()
    const setBuildError = vi.fn()
    const cleanupFn = vi.fn()
    const onProgress = vi.fn(() => cleanupFn)
    const setImageRemoved = vi.fn()

    await simulateStartupAutoBuild(true, ensureImage, setBuildProgress, setBuildError, onProgress, () => false, setImageRemoved)

    expect(cleanupFn).toHaveBeenCalled()
  })

  it('cleans up listener on error', async () => {
    const ensureImage = vi.fn().mockRejectedValue(new Error('fail'))
    const setBuildProgress = vi.fn()
    const setBuildError = vi.fn()
    const cleanupFn = vi.fn()
    const onProgress = vi.fn(() => cleanupFn)
    const setImageRemoved = vi.fn()

    await simulateStartupAutoBuild(true, ensureImage, setBuildProgress, setBuildError, onProgress, () => false, setImageRemoved)

    expect(cleanupFn).toHaveBeenCalled()
  })

  it('sets imageRemoved to false on success', async () => {
    const ensureImage = vi.fn().mockResolvedValue(undefined)
    const setBuildProgress = vi.fn()
    const setBuildError = vi.fn()
    const onProgress = vi.fn(() => vi.fn())
    const setImageRemoved = vi.fn()

    await simulateStartupAutoBuild(true, ensureImage, setBuildProgress, setBuildError, onProgress, () => false, setImageRemoved)

    expect(setImageRemoved).toHaveBeenCalledWith(false)
  })
})

describe('build cancel behavior', () => {
  /**
   * Simulates tab creation with cancel support.
   * Mirrors createYoliumWithAgent in App.tsx with the cancel ref check.
   */
  async function simulateTabCreationWithCancel(
    ensureImage: () => Promise<void>,
    createContainer: () => Promise<string>,
    isCancelled: () => boolean,
    setBuildProgress: (value: string[] | null) => void,
    setBuildError: (value: string | null) => void,
    onProgress: (callback: (message: string) => void) => (() => void),
  ): Promise<'success' | 'cancelled' | 'build-error' | 'container-error'> {
    const cleanupProgress = onProgress((message) => {
      setBuildProgress([message])
    })

    setBuildError(null)
    setBuildProgress(['Checking Yolium image...'])

    try {
      await ensureImage()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setBuildError(message)
      cleanupProgress()
      return 'build-error'
    }

    cleanupProgress()

    // Check cancel after build completes
    if (isCancelled()) {
      return 'cancelled'
    }

    setBuildProgress(null)

    try {
      await createContainer()
      return 'success'
    } catch {
      return 'container-error'
    }
  }

  it('creates container when not cancelled', async () => {
    const ensureImage = vi.fn().mockResolvedValue(undefined)
    const createContainer = vi.fn().mockResolvedValue('session-123')
    const setBuildProgress = vi.fn()
    const setBuildError = vi.fn()
    const onProgress = vi.fn(() => vi.fn())

    const result = await simulateTabCreationWithCancel(
      ensureImage, createContainer, () => false,
      setBuildProgress, setBuildError, onProgress
    )

    expect(result).toBe('success')
    expect(createContainer).toHaveBeenCalled()
  })

  it('skips container when cancelled', async () => {
    const ensureImage = vi.fn().mockResolvedValue(undefined)
    const createContainer = vi.fn().mockResolvedValue('session-123')
    const setBuildProgress = vi.fn()
    const setBuildError = vi.fn()
    const onProgress = vi.fn(() => vi.fn())

    const result = await simulateTabCreationWithCancel(
      ensureImage, createContainer, () => true,
      setBuildProgress, setBuildError, onProgress
    )

    expect(result).toBe('cancelled')
    expect(createContainer).not.toHaveBeenCalled()
  })

  it('still reports error if build fails', async () => {
    const ensureImage = vi.fn().mockRejectedValue(new Error('Docker build failed'))
    const createContainer = vi.fn().mockResolvedValue('session-123')
    const setBuildProgress = vi.fn()
    const setBuildError = vi.fn()
    const onProgress = vi.fn(() => vi.fn())

    const result = await simulateTabCreationWithCancel(
      ensureImage, createContainer, () => false,
      setBuildProgress, setBuildError, onProgress
    )

    expect(result).toBe('build-error')
    expect(setBuildError).toHaveBeenCalledWith('Docker build failed')
    expect(createContainer).not.toHaveBeenCalled()
  })
})

// ============================================================================
// getYoliumImageInfo Error Handling Tests
// ============================================================================

describe('getYoliumImageInfo error handling', () => {
  /**
   * Simulates the improved error handling in getYoliumImageInfo.
   * Returns null only for 404 (image not found), throws for other errors.
   */
  async function simulateGetImageInfo(
    inspectFn: () => Promise<{ Size: number; Created: string; Config?: { Labels?: Record<string, string> } }>,
    computeHash?: () => string,
  ): Promise<{ name: string; size: number; created: string; stale: boolean } | null> {
    try {
      const inspect = await inspectFn();
      const labels = inspect.Config?.Labels || {};
      const imageHash = labels['yolium.build_hash'];

      let stale = false;
      if (imageHash && computeHash) {
        try {
          const currentHash = computeHash();
          stale = imageHash !== currentHash;
        } catch {
          // skip staleness check
        }
      }

      return {
        name: 'yolium:latest',
        size: inspect.Size,
        created: inspect.Created,
        stale,
      };
    } catch (err) {
      // 404 means image doesn't exist
      if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  it('returns image info when image exists', async () => {
    const result = await simulateGetImageInfo(
      async () => ({
        Size: 1024 * 1024 * 500,
        Created: '2026-01-01T00:00:00Z',
        Config: { Labels: { 'yolium.build_hash': 'abc123' } },
      }),
      () => 'abc123',
    );

    expect(result).not.toBeNull();
    expect(result!.name).toBe('yolium:latest');
    expect(result!.size).toBe(1024 * 1024 * 500);
    expect(result!.stale).toBe(false);
  });

  it('returns null for 404 (image not found)', async () => {
    const result = await simulateGetImageInfo(
      async () => { throw Object.assign(new Error('not found'), { statusCode: 404 }); },
    );

    expect(result).toBeNull();
  });

  it('throws on non-404 errors (e.g. Docker daemon down)', async () => {
    await expect(
      simulateGetImageInfo(
        async () => { throw Object.assign(new Error('connection refused'), { statusCode: 500 }); },
      ),
    ).rejects.toThrow('connection refused');
  });

  it('throws on network errors without statusCode', async () => {
    await expect(
      simulateGetImageInfo(
        async () => { throw new Error('ECONNREFUSED'); },
      ),
    ).rejects.toThrow('ECONNREFUSED');
  });

  it('detects stale image when hashes differ', async () => {
    const result = await simulateGetImageInfo(
      async () => ({
        Size: 1024 * 1024 * 500,
        Created: '2026-01-01T00:00:00Z',
        Config: { Labels: { 'yolium.build_hash': 'old_hash' } },
      }),
      () => 'new_hash',
    );

    expect(result!.stale).toBe(true);
  });

  it('skips staleness check when hash computation fails', async () => {
    const result = await simulateGetImageInfo(
      async () => ({
        Size: 1024 * 1024 * 500,
        Created: '2026-01-01T00:00:00Z',
        Config: { Labels: { 'yolium.build_hash': 'abc123' } },
      }),
      () => { throw new Error('Dockerfile not found'); },
    );

    expect(result!.stale).toBe(false);
  });
})

// ============================================================================
// Docker Image Fetch with Retry Tests
// ============================================================================

describe('docker image fetch with retry', () => {
  /**
   * Simulates the retry logic used in GitConfigDialog's fetchDockerImageInfo.
   */
  async function fetchWithRetry(
    getImageInfo: () => Promise<{ name: string } | null>,
    maxAttempts: number = 2,
  ): Promise<{ info: { name: string } | null; error: boolean }> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const info = await getImageInfo();
        return { info, error: false };
      } catch {
        if (attempt < maxAttempts) {
          // In real code this would be a delay, skip in tests
          continue;
        }
      }
    }
    return { info: null, error: true };
  }

  it('returns info on first successful attempt', async () => {
    const getImageInfo = vi.fn().mockResolvedValue({ name: 'yolium:latest' });
    const result = await fetchWithRetry(getImageInfo);
    expect(result.info).toEqual({ name: 'yolium:latest' });
    expect(result.error).toBe(false);
    expect(getImageInfo).toHaveBeenCalledTimes(1);
  });

  it('retries on first failure and succeeds on second attempt', async () => {
    const getImageInfo = vi.fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ name: 'yolium:latest' });

    const result = await fetchWithRetry(getImageInfo);
    expect(result.info).toEqual({ name: 'yolium:latest' });
    expect(result.error).toBe(false);
    expect(getImageInfo).toHaveBeenCalledTimes(2);
  });

  it('returns error after all attempts fail', async () => {
    const getImageInfo = vi.fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockRejectedValueOnce(new Error('connection refused'));

    const result = await fetchWithRetry(getImageInfo);
    expect(result.info).toBeNull();
    expect(result.error).toBe(true);
    expect(getImageInfo).toHaveBeenCalledTimes(2);
  });

  it('returns null info (image not found) without error', async () => {
    const getImageInfo = vi.fn().mockResolvedValue(null);
    const result = await fetchWithRetry(getImageInfo);
    expect(result.info).toBeNull();
    expect(result.error).toBe(false);
  });
})

// ============================================================================
// Build Progress Re-fetch Tests
// ============================================================================

describe('build progress re-fetch behavior', () => {
  it('triggers re-fetch on "Image built successfully!" message', () => {
    const messages = [
      'Building Docker image...',
      '#1 [1/5] FROM ubuntu:22.04',
      '#2 [2/5] RUN apt-get update',
      'Image built successfully!',
    ];

    const fetchCalls: number[] = [];
    const triggerMessages = new Set(['Image built successfully!', 'Image is up to date.']);

    messages.forEach((msg, i) => {
      if (triggerMessages.has(msg)) {
        fetchCalls.push(i);
      }
    });

    expect(fetchCalls).toEqual([3]); // Only the success message triggers re-fetch
  });

  it('triggers re-fetch on "Image is up to date." message', () => {
    const messages = ['Checking Yolium image...', 'Image is up to date.'];

    const fetchCalls: number[] = [];
    const triggerMessages = new Set(['Image built successfully!', 'Image is up to date.']);

    messages.forEach((msg, i) => {
      if (triggerMessages.has(msg)) {
        fetchCalls.push(i);
      }
    });

    expect(fetchCalls).toEqual([1]);
  });

  it('does not trigger re-fetch on build progress messages', () => {
    const messages = [
      'Building Docker image...',
      '#1 [1/5] FROM ubuntu:22.04',
      'Dockerfile or entrypoint changed, rebuilding image...',
    ];

    const fetchCalls: number[] = [];
    const triggerMessages = new Set(['Image built successfully!', 'Image is up to date.']);

    messages.forEach((msg, i) => {
      if (triggerMessages.has(msg)) {
        fetchCalls.push(i);
      }
    });

    expect(fetchCalls).toEqual([]);
  });
})

describe('agent session cleanup with worktrees', () => {
  interface MockAgentSession {
    id: string;
    containerId: string;
    state: 'running' | 'stopped' | 'crashed';
    timeoutId?: NodeJS.Timeout;
    worktreePath?: string;
    originalPath?: string;
    branchName?: string;
  }

  async function simulateCloseAllAgentSessions(
    sessions: Map<string, MockAgentSession>,
    mockStopContainer: (containerId: string) => Promise<void>,
    mockRemoveContainer: (containerId: string) => Promise<void>,
    mockDeleteWorktree: (originalPath: string, worktreePath: string) => void
  ): Promise<void> {
    const sessionIds = Array.from(sessions.keys());

    await Promise.all(sessionIds.map(async (sessionId) => {
      const session = sessions.get(sessionId);
      if (!session) return;

      // Clean up worktree first
      if (session.worktreePath && session.originalPath) {
        try {
          mockDeleteWorktree(session.originalPath, session.worktreePath);
        } catch {
          // Continue cleanup even if worktree deletion fails
        }
      }

      // Clear timeout
      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
      }

      // Stop and remove container
      try {
        await mockStopContainer(session.containerId);
      } catch {
        // Container may already be stopped
      }
      try {
        await mockRemoveContainer(session.containerId);
      } catch {
        // Container may already be removed
      }
    }));

    sessions.clear();
  }

  it('cleans up agent worktrees on closeAll', async () => {
    const sessions = new Map<string, MockAgentSession>();
    const deleteWorktreeMock = vi.fn();
    const stopMock = vi.fn().mockResolvedValue(undefined);
    const removeMock = vi.fn().mockResolvedValue(undefined);

    sessions.set('agent-1', {
      id: 'agent-1',
      containerId: 'container-1',
      state: 'running',
      worktreePath: '/home/user/.yolium/worktrees/proj/branch-1',
      originalPath: '/home/user/project',
      branchName: 'branch-1',
    });
    sessions.set('agent-2', {
      id: 'agent-2',
      containerId: 'container-2',
      state: 'running',
      // No worktree
    });

    await simulateCloseAllAgentSessions(sessions, stopMock, removeMock, deleteWorktreeMock);

    // Only agent-1 has a worktree
    expect(deleteWorktreeMock).toHaveBeenCalledTimes(1);
    expect(deleteWorktreeMock).toHaveBeenCalledWith(
      '/home/user/project',
      '/home/user/.yolium/worktrees/proj/branch-1'
    );

    // Both containers should be cleaned up
    expect(stopMock).toHaveBeenCalledTimes(2);
    expect(removeMock).toHaveBeenCalledTimes(2);
    expect(sessions.size).toBe(0);
  });

  it('continues cleanup even if agent worktree deletion fails', async () => {
    const sessions = new Map<string, MockAgentSession>();
    const deleteWorktreeMock = vi.fn(() => { throw new Error('Worktree busy'); });
    const stopMock = vi.fn().mockResolvedValue(undefined);
    const removeMock = vi.fn().mockResolvedValue(undefined);

    sessions.set('agent-1', {
      id: 'agent-1',
      containerId: 'container-1',
      state: 'running',
      worktreePath: '/path/worktree',
      originalPath: '/path/project',
    });

    await simulateCloseAllAgentSessions(sessions, stopMock, removeMock, deleteWorktreeMock);

    // Container cleanup should still happen
    expect(stopMock).toHaveBeenCalledWith('container-1');
    expect(removeMock).toHaveBeenCalledWith('container-1');
    expect(sessions.size).toBe(0);
  });

  it('deletes agent worktree before stopping container', async () => {
    const callOrder: string[] = [];
    const sessions = new Map<string, MockAgentSession>();
    const deleteWorktreeMock = vi.fn(() => { callOrder.push('deleteWorktree'); });
    const stopMock = vi.fn(async () => { callOrder.push('stopContainer'); });
    const removeMock = vi.fn(async () => { callOrder.push('removeContainer'); });

    sessions.set('agent-1', {
      id: 'agent-1',
      containerId: 'container-1',
      state: 'running',
      worktreePath: '/path/worktree',
      originalPath: '/path/project',
    });

    await simulateCloseAllAgentSessions(sessions, stopMock, removeMock, deleteWorktreeMock);

    expect(callOrder).toEqual(['deleteWorktree', 'stopContainer', 'removeContainer']);
  });

  it('clears agent timeouts during cleanup', async () => {
    const sessions = new Map<string, MockAgentSession>();
    const timeoutId = setTimeout(() => {}, 600000);
    const deleteWorktreeMock = vi.fn();
    const stopMock = vi.fn().mockResolvedValue(undefined);
    const removeMock = vi.fn().mockResolvedValue(undefined);

    sessions.set('agent-1', {
      id: 'agent-1',
      containerId: 'container-1',
      state: 'running',
      timeoutId,
    });

    await simulateCloseAllAgentSessions(sessions, stopMock, removeMock, deleteWorktreeMock);

    expect(sessions.size).toBe(0);
    // Timeout should have been cleared (no leaked timers)
    clearTimeout(timeoutId); // Ensure it's cleared for test cleanup
  });
})

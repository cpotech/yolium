import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock child_process to avoid actual git commands
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  execFile: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

// Import after mocking
import { execFileSync } from 'node:child_process'
import {
  getWorktreeChangedFiles,
  getWorktreeFileDiff,
} from '@main/git/git-worktree'

describe('getWorktreeChangedFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: branch validation passes, default branch detection returns 'main'
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const argList = args as string[] | undefined
      if (argList && argList[0] === 'check-ref-format') {
        return Buffer.from('')
      }
      if (argList && argList[0] === 'symbolic-ref') {
        return Buffer.from('refs/remotes/origin/main')
      }
      return Buffer.from('')
    })
  })

  it('parses --name-status output with M, A, D statuses', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[], options?: any) => {
      const argList = args as string[] | undefined
      if (argList && argList[0] === 'check-ref-format') {
        return Buffer.from('')
      }
      if (argList && argList[0] === 'symbolic-ref') {
        return 'refs/remotes/origin/main'
      }
      if (argList && argList[0] === 'diff') {
        return 'M\tsrc/app.ts\nA\tsrc/new-file.ts\nD\tsrc/old-file.ts\n'
      }
      return Buffer.from('')
    })

    const result = getWorktreeChangedFiles('/project', 'feature-branch')
    expect(result).toEqual([
      { path: 'src/app.ts', status: 'M' },
      { path: 'src/new-file.ts', status: 'A' },
      { path: 'src/old-file.ts', status: 'D' },
    ])
  })

  it('parses rename status correctly', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[], options?: any) => {
      const argList = args as string[] | undefined
      if (argList && argList[0] === 'check-ref-format') {
        return Buffer.from('')
      }
      if (argList && argList[0] === 'symbolic-ref') {
        return 'refs/remotes/origin/main'
      }
      if (argList && argList[0] === 'diff') {
        return 'R100\tsrc/old-name.ts\tsrc/new-name.ts\n'
      }
      return Buffer.from('')
    })

    const result = getWorktreeChangedFiles('/project', 'feature-branch')
    expect(result).toEqual([
      { path: 'src/new-name.ts', status: 'R' },
    ])
  })

  it('returns empty array when no changes', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[], options?: any) => {
      const argList = args as string[] | undefined
      if (argList && argList[0] === 'check-ref-format') {
        return Buffer.from('')
      }
      if (argList && argList[0] === 'symbolic-ref') {
        return 'refs/remotes/origin/main'
      }
      if (argList && argList[0] === 'diff') {
        return ''
      }
      return Buffer.from('')
    })

    const result = getWorktreeChangedFiles('/project', 'feature-branch')
    expect(result).toEqual([])
  })

  it('throws on error', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[], options?: any) => {
      const argList = args as string[] | undefined
      if (argList && argList[0] === 'check-ref-format') {
        return Buffer.from('')
      }
      if (argList && argList[0] === 'symbolic-ref') {
        return 'refs/remotes/origin/main'
      }
      if (argList && argList[0] === 'diff') {
        throw new Error('git error')
      }
      return Buffer.from('')
    })

    expect(() => getWorktreeChangedFiles('/project', 'feature-branch')).toThrow('git error')
  })
})

describe('getWorktreeFileDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns raw unified diff string', () => {
    const expectedDiff = `diff --git a/src/app.ts b/src/app.ts
index abc1234..def5678 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 import React from 'react'
+import { useState } from 'react'

 function App() {
`
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const argList = args as string[] | undefined
      if (argList && argList[0] === 'check-ref-format') {
        return Buffer.from('')
      }
      if (argList && argList[0] === 'symbolic-ref') {
        return Buffer.from('refs/remotes/origin/main')
      }
      if (argList && argList[0] === 'diff') {
        return expectedDiff
      }
      return Buffer.from('')
    })

    const result = getWorktreeFileDiff('/project', 'feature-branch', 'src/app.ts')
    expect(result).toBe(expectedDiff)
  })

  it('throws on error', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const argList = args as string[] | undefined
      if (argList && argList[0] === 'check-ref-format') {
        return Buffer.from('')
      }
      if (argList && argList[0] === 'symbolic-ref') {
        return Buffer.from('refs/remotes/origin/main')
      }
      if (argList && argList[0] === 'diff') {
        throw new Error('git error')
      }
      return Buffer.from('')
    })

    expect(() => getWorktreeFileDiff('/project', 'feature-branch', 'src/app.ts')).toThrow('git error')
  })

  it('calls git diff with correct arguments', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const argList = args as string[] | undefined
      if (argList && argList[0] === 'check-ref-format') {
        return Buffer.from('')
      }
      if (argList && argList[0] === 'symbolic-ref') {
        return Buffer.from('refs/remotes/origin/main')
      }
      if (argList && argList[0] === 'diff') {
        return 'diff output'
      }
      return Buffer.from('')
    })

    getWorktreeFileDiff('/project', 'my-branch', 'src/index.ts')

    // Find the diff call
    const diffCall = vi.mocked(execFileSync).mock.calls.find(
      (call) => (call[1] as string[])?.[0] === 'diff',
    )
    expect(diffCall).toBeDefined()
    expect(diffCall![1]).toEqual(['diff', 'main...my-branch', '--', 'src/index.ts'])
    expect(diffCall![2]).toMatchObject({ cwd: '/project', encoding: 'utf-8' })
  })
})

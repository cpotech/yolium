import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock node:fs/promises
const mockStat = vi.fn()
const mockReadFile = vi.fn()
const mockReaddir = vi.fn()
const mockAccess = vi.fn()
const mockMkdir = vi.fn()

vi.mock('node:fs/promises', () => ({
  stat: (...args: unknown[]) => mockStat(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  access: (...args: unknown[]) => mockAccess(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}))

vi.mock('node:os', () => ({
  homedir: () => '/home/testuser',
}))

import { registerFilesystemHandlers } from '@main/ipc/filesystem-handlers'

describe('filesystem-handlers fs:read-file', () => {
  let handlers: Record<string, (...args: unknown[]) => unknown>

  beforeEach(() => {
    handlers = {}
    const mockIpcMain = {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers[channel] = handler
      },
    }
    registerFilesystemHandlers(mockIpcMain as any)
    vi.clearAllMocks()
  })

  it('should register the fs:read-file handler', () => {
    expect(handlers['fs:read-file']).toBeDefined()
  })

  it('should read a valid file successfully', async () => {
    mockStat.mockResolvedValue({ isFile: () => true, size: 500 })
    mockReadFile.mockResolvedValue('<html><body>Hello</body></html>')

    const result = await handlers['fs:read-file']({}, '/home/testuser/project/.yolium/mocks/test.html')

    expect(result).toEqual({
      success: true,
      content: '<html><body>Hello</body></html>',
      error: null,
    })
  })

  it('should reject paths with directory traversal (..)', async () => {
    const result = await handlers['fs:read-file']({}, '/home/testuser/../etc/passwd')

    expect(result).toEqual({
      success: false,
      content: null,
      error: 'Path traversal not allowed',
    })
    expect(mockStat).not.toHaveBeenCalled()
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('should reject paths that are not files', async () => {
    mockStat.mockResolvedValue({ isFile: () => false, size: 0 })

    const result = await handlers['fs:read-file']({}, '/home/testuser/project')

    expect(result).toEqual({
      success: false,
      content: null,
      error: 'Path is not a file',
    })
  })

  it('should reject files larger than 1MB', async () => {
    mockStat.mockResolvedValue({ isFile: () => true, size: 2 * 1024 * 1024 })

    const result = await handlers['fs:read-file']({}, '/home/testuser/project/big.html')

    expect(result).toEqual({
      success: false,
      content: null,
      error: 'File exceeds 1MB size limit',
    })
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('should return error for non-existent files', async () => {
    const err = new Error('ENOENT: no such file') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    mockStat.mockRejectedValue(err)

    const result = await handlers['fs:read-file']({}, '/home/testuser/project/missing.html')

    expect(result).toEqual({
      success: false,
      content: null,
      error: 'File not found',
    })
  })

  it('should return error for permission denied', async () => {
    const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException
    err.code = 'EACCES'
    mockStat.mockRejectedValue(err)

    const result = await handlers['fs:read-file']({}, '/home/testuser/secret.html')

    expect(result).toEqual({
      success: false,
      content: null,
      error: 'Permission denied',
    })
  })

  it('should accept files exactly at the 1MB limit', async () => {
    const exactLimit = 1024 * 1024
    mockStat.mockResolvedValue({ isFile: () => true, size: exactLimit })
    mockReadFile.mockResolvedValue('content')

    const result = await handlers['fs:read-file']({}, '/home/testuser/project/exact.html')

    expect(result).toEqual({
      success: true,
      content: 'content',
      error: null,
    })
  })
})

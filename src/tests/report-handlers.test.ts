import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mocks so they are available inside vi.mock factories
const { mockStat, mockLoadFile, MockBrowserWindow } = vi.hoisted(() => {
  const mockLoadFile = vi.fn()
  const MockBrowserWindow = vi.fn()
  return { mockStat: vi.fn(), mockLoadFile, MockBrowserWindow }
})

vi.mock('node:fs/promises', () => ({
  stat: (...args: unknown[]) => mockStat(...args),
}))

vi.mock('node:os', () => ({
  default: { homedir: () => '/home/user' },
  homedir: () => '/home/user',
}))

vi.mock('electron', () => ({
  BrowserWindow: MockBrowserWindow,
}))

import { registerReportHandlers } from '@main/ipc/report-handlers'

describe('report-handlers report:open-file', () => {
  let handlers: Record<string, (...args: unknown[]) => unknown>

  beforeEach(() => {
    handlers = {}
    const mockIpcMain = {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers[channel] = handler
      },
    }
    registerReportHandlers(mockIpcMain as any)
    vi.clearAllMocks()
    // Re-set BrowserWindow implementation after clearAllMocks
    // Must use regular function (not arrow) so it works as a constructor with `new`
    MockBrowserWindow.mockImplementation(function (this: any) {
      this.loadFile = mockLoadFile
    })
  })

  it('should register the report:open-file handler', () => {
    expect(handlers['report:open-file']).toBeDefined()
  })

  it('should reject empty file path', async () => {
    const result = await handlers['report:open-file']({}, '')
    expect(result).toEqual({ success: false, error: 'File path is required' })
  })

  it('should reject path traversal (..)', async () => {
    const result = await handlers['report:open-file']({}, '/etc/passwd.html')
    expect(result).toEqual({ success: false, error: 'Path traversal is not allowed' })
  })

  it('should reject non-HTML files', async () => {
    const result = await handlers['report:open-file']({}, '/home/user/report.txt')
    expect(result).toEqual({ success: false, error: 'Only HTML files are allowed' })
  })

  it('should reject non-HTML file with .js extension', async () => {
    const result = await handlers['report:open-file']({}, '/home/user/report.js')
    expect(result).toEqual({ success: false, error: 'Only HTML files are allowed' })
  })

  it('should accept .htm extension', async () => {
    mockStat.mockResolvedValue({ isFile: () => true })
    const result = await handlers['report:open-file']({}, '/home/user/vitest-report/index.htm')
    expect(result).toEqual({ success: true })
  })

  it('should return error when file not found', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'))
    const result = await handlers['report:open-file']({}, '/home/user/vitest-report/index.html')
    expect(result).toEqual({ success: false, error: 'File not found' })
  })

  it('should return error when path is not a file', async () => {
    mockStat.mockResolvedValue({ isFile: () => false })
    const result = await handlers['report:open-file']({}, '/home/user/vitest-report/index.html')
    expect(result).toEqual({ success: false, error: 'Path is not a file' })
  })

  it('should open BrowserWindow with correct security settings for valid HTML file', async () => {
    mockStat.mockResolvedValue({ isFile: () => true })

    const result = await handlers['report:open-file']({}, '/home/user/project/vitest-report/index.html')

    expect(result).toEqual({ success: true })
    expect(MockBrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'vitest-report',
        webPreferences: expect.objectContaining({
          nodeIntegration: false,
          contextIsolation: true,
        }),
      }),
    )
    expect(mockLoadFile).toHaveBeenCalledWith('/home/user/project/vitest-report/index.html')
  })

  it('should set window title to parent directory name', async () => {
    mockStat.mockResolvedValue({ isFile: () => true })

    await handlers['report:open-file']({}, '/home/user/project/playwright-report/index.html')

    expect(MockBrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'playwright-report',
      }),
    )
  })
})

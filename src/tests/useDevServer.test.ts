/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDevServer } from '@renderer/hooks/useDevServer'

const mockDetectDevCommand = vi.fn()
const mockStartDevServer = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis.window as any).electronAPI = {
    agent: {
      detectDevCommand: mockDetectDevCommand,
      startDevServer: mockStartDevServer,
    },
  }
})

describe('useDevServer', () => {
  it('should start in idle status with no detected command', () => {
    const { result } = renderHook(() =>
      useDevServer({
        itemId: null,
        projectPath: null,
        currentSessionId: null,
        portMappings: {},
      }),
    )

    expect(result.current.status).toBe('idle')
    expect(result.current.detectedCommand).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('should auto-detect command when container session exists', async () => {
    mockDetectDevCommand.mockResolvedValue('npm run dev')

    const { result } = renderHook(() =>
      useDevServer({
        itemId: 'item-1',
        projectPath: '/project',
        currentSessionId: 'session-1',
        portMappings: {},
      }),
    )

    await waitFor(() => {
      expect(result.current.detectedCommand).toBe('npm run dev')
    })

    expect(result.current.status).toBe('idle')
    expect(mockDetectDevCommand).toHaveBeenCalledWith('/project', 'item-1')
  })

  it('should set status to detecting while detection is in progress', async () => {
    let resolveDetect!: (value: string | null) => void
    mockDetectDevCommand.mockImplementation(
      () => new Promise<string | null>(resolve => { resolveDetect = resolve }),
    )

    const { result } = renderHook(() =>
      useDevServer({
        itemId: 'item-1',
        projectPath: '/project',
        currentSessionId: 'session-1',
        portMappings: {},
      }),
    )

    await waitFor(() => {
      expect(result.current.status).toBe('detecting')
    })

    await act(async () => {
      resolveDetect('npm run dev')
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.detectedCommand).toBe('npm run dev')
  })

  it('should set detected command after successful detection', async () => {
    mockDetectDevCommand.mockResolvedValue('yarn run dev')

    const { result } = renderHook(() =>
      useDevServer({
        itemId: 'item-1',
        projectPath: '/project',
        currentSessionId: 'session-1',
        portMappings: {},
      }),
    )

    await waitFor(() => {
      expect(result.current.detectedCommand).toBe('yarn run dev')
    })
  })

  it('should set status to starting when start is called', async () => {
    mockDetectDevCommand.mockResolvedValue('npm run dev')
    let resolveStart!: (value: { success: boolean }) => void
    mockStartDevServer.mockImplementation(
      () => new Promise(resolve => { resolveStart = resolve }),
    )

    const { result } = renderHook(() =>
      useDevServer({
        itemId: 'item-1',
        projectPath: '/project',
        currentSessionId: 'session-1',
        portMappings: {},
      }),
    )

    await waitFor(() => {
      expect(result.current.detectedCommand).toBe('npm run dev')
    })

    // Start dev server (don't await — we want to catch the intermediate state)
    act(() => {
      void result.current.start()
    })

    expect(result.current.status).toBe('starting')

    await act(async () => {
      resolveStart({ success: true })
    })

    expect(result.current.status).toBe('running')
  })

  it('should set status to running after successful start', async () => {
    mockDetectDevCommand.mockResolvedValue('npm run dev')
    mockStartDevServer.mockResolvedValue({ success: true })

    const { result } = renderHook(() =>
      useDevServer({
        itemId: 'item-1',
        projectPath: '/project',
        currentSessionId: 'session-1',
        portMappings: {},
      }),
    )

    await waitFor(() => {
      expect(result.current.detectedCommand).toBe('npm run dev')
    })

    await act(async () => {
      await result.current.start()
    })

    expect(result.current.status).toBe('running')
    expect(mockStartDevServer).toHaveBeenCalledWith('/project', 'item-1', undefined)
  })

  it('should set error status when detection fails', async () => {
    mockDetectDevCommand.mockRejectedValue(new Error('Docker unreachable'))

    const { result } = renderHook(() =>
      useDevServer({
        itemId: 'item-1',
        projectPath: '/project',
        currentSessionId: 'session-1',
        portMappings: {},
      }),
    )

    await waitFor(() => {
      expect(result.current.status).toBe('error')
    })

    expect(result.current.error).toBe('Docker unreachable')
  })

  it('should set error status when start fails', async () => {
    mockDetectDevCommand.mockResolvedValue('npm run dev')
    mockStartDevServer.mockResolvedValue({ success: false, error: 'Container stopped' })

    const { result } = renderHook(() =>
      useDevServer({
        itemId: 'item-1',
        projectPath: '/project',
        currentSessionId: 'session-1',
        portMappings: {},
      }),
    )

    await waitFor(() => {
      expect(result.current.detectedCommand).toBe('npm run dev')
    })

    await act(async () => {
      await result.current.start()
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('Container stopped')
  })

  it('should allow manual command when auto-detect returns null', async () => {
    mockDetectDevCommand.mockResolvedValue(null)
    mockStartDevServer.mockResolvedValue({ success: true })

    const { result } = renderHook(() =>
      useDevServer({
        itemId: 'item-1',
        projectPath: '/project',
        currentSessionId: 'session-1',
        portMappings: {},
      }),
    )

    await waitFor(() => {
      expect(result.current.status).toBe('idle')
    })

    expect(result.current.detectedCommand).toBeNull()

    await act(async () => {
      await result.current.start('npx serve')
    })

    expect(result.current.status).toBe('running')
    expect(mockStartDevServer).toHaveBeenCalledWith('/project', 'item-1', 'npx serve')
  })

  it('should not detect when no container session exists', () => {
    const { result } = renderHook(() =>
      useDevServer({
        itemId: 'item-1',
        projectPath: '/project',
        currentSessionId: null,
        portMappings: {},
      }),
    )

    expect(result.current.status).toBe('idle')
    expect(mockDetectDevCommand).not.toHaveBeenCalled()
  })
})

/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBrowserPreview } from '@renderer/hooks/useBrowserPreview'

const mockGetPortMappings = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()

  ;(globalThis.window as any).electronAPI = {
    agent: {
      getPortMappings: mockGetPortMappings,
    },
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useBrowserPreview', () => {
  it('should initialize with isOpen=false and empty url', () => {
    const { result } = renderHook(() => useBrowserPreview(null, null))

    expect(result.current.isOpen).toBe(false)
    expect(result.current.url).toBe('')
    expect(result.current.portMappings).toEqual({})
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should toggle isOpen when toggle() called', () => {
    const { result } = renderHook(() => useBrowserPreview(null, null))

    act(() => result.current.toggle())
    expect(result.current.isOpen).toBe(true)

    act(() => result.current.toggle())
    expect(result.current.isOpen).toBe(false)
  })

  it('should set url from port mapping when ports are available', async () => {
    mockGetPortMappings.mockResolvedValue({ 3000: 54321 })

    const { result } = renderHook(() => useBrowserPreview('item-1', '/project'))

    // Open the panel to trigger polling
    act(() => result.current.toggle())

    // Flush the IPC call
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.url).toBe('http://localhost:54321')
    expect(result.current.portMappings).toEqual({ 3000: 54321 })
  })

  it('should return empty url when no ports mapped', async () => {
    mockGetPortMappings.mockResolvedValue({})

    const { result } = renderHook(() => useBrowserPreview('item-1', '/project'))

    act(() => result.current.toggle())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.url).toBe('')
  })

  it('should call agent:get-container-port-mappings IPC on mount when projectPath and itemId provided', async () => {
    mockGetPortMappings.mockResolvedValue({})

    const { result } = renderHook(() => useBrowserPreview('item-1', '/project'))

    act(() => result.current.toggle())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockGetPortMappings).toHaveBeenCalledWith('/project', 'item-1')
  })

  it('should poll for port mappings every 3 seconds while panel is open', async () => {
    mockGetPortMappings.mockResolvedValue({ 3000: 54321 })

    const { result } = renderHook(() => useBrowserPreview('item-1', '/project'))

    act(() => result.current.toggle())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // Initial call
    expect(mockGetPortMappings).toHaveBeenCalledTimes(1)

    // Advance 3 seconds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(mockGetPortMappings).toHaveBeenCalledTimes(2)

    // Advance another 3 seconds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(mockGetPortMappings).toHaveBeenCalledTimes(3)
  })

  it('should stop polling when panel is closed', async () => {
    mockGetPortMappings.mockResolvedValue({ 3000: 54321 })

    const { result } = renderHook(() => useBrowserPreview('item-1', '/project'))

    act(() => result.current.toggle()) // open
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockGetPortMappings).toHaveBeenCalledTimes(1)

    act(() => result.current.toggle()) // close

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    // No additional calls after closing
    expect(mockGetPortMappings).toHaveBeenCalledTimes(1)
  })

  it('should update url when port mappings change', async () => {
    mockGetPortMappings
      .mockResolvedValueOnce({ 3000: 54321 })
      .mockResolvedValueOnce({ 3000: 54321, 5173: 54322 })

    const { result } = renderHook(() => useBrowserPreview('item-1', '/project'))

    act(() => result.current.toggle())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.url).toBe('http://localhost:54321')

    // After poll, if URL was auto-selected, it stays (doesn't change to new port)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(result.current.portMappings).toEqual({ 3000: 54321, 5173: 54322 })
  })

  it('should handle IPC errors gracefully and set error state', async () => {
    mockGetPortMappings.mockRejectedValue(new Error('Container not found'))

    const { result } = renderHook(() => useBrowserPreview('item-1', '/project'))

    act(() => result.current.toggle())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.error).toBe('Container not found')
    expect(result.current.url).toBe('')
  })

  it('should allow manual url override via setUrl', async () => {
    mockGetPortMappings.mockResolvedValue({ 3000: 54321 })

    const { result } = renderHook(() => useBrowserPreview('item-1', '/project'))

    act(() => result.current.toggle())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.url).toBe('http://localhost:54321')

    act(() => result.current.setUrl('http://localhost:54322'))
    expect(result.current.url).toBe('http://localhost:54322')
  })

  it('should not fetch when projectPath is null', async () => {
    mockGetPortMappings.mockResolvedValue({})

    const { result } = renderHook(() => useBrowserPreview('item-1', null))

    act(() => result.current.toggle())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockGetPortMappings).not.toHaveBeenCalled()
  })
})

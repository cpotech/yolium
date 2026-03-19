/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useConfirmDialog } from '@renderer/hooks/useConfirmDialog'

// Mock VimModeContext (used indirectly via ConfirmDialog)
vi.mock('@renderer/context/VimModeContext', () => ({
  useSuspendVimNavigation: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useConfirmDialog', () => {
  it('should return confirm function and ConfirmDialog props', () => {
    const { result } = renderHook(() => useConfirmDialog())
    expect(typeof result.current.confirm).toBe('function')
    expect(result.current.dialogProps).toBeDefined()
    expect(result.current.dialogProps.isOpen).toBe(false)
  })

  it('should resolve true when onConfirm is called', async () => {
    const { result } = renderHook(() => useConfirmDialog())

    let resolved: boolean | undefined
    act(() => {
      result.current.confirm({ title: 'Test', message: 'Test message' }).then(v => { resolved = v })
    })

    expect(result.current.dialogProps.isOpen).toBe(true)

    act(() => {
      result.current.dialogProps.onConfirm()
    })

    await vi.waitFor(() => expect(resolved).toBe(true))
  })

  it('should resolve false when onCancel is called', async () => {
    const { result } = renderHook(() => useConfirmDialog())

    let resolved: boolean | undefined
    act(() => {
      result.current.confirm({ title: 'Test', message: 'Test message' }).then(v => { resolved = v })
    })

    act(() => {
      result.current.dialogProps.onCancel()
    })

    await vi.waitFor(() => expect(resolved).toBe(false))
  })

  it('should set isOpen to true when confirm() is called', () => {
    const { result } = renderHook(() => useConfirmDialog())

    act(() => {
      result.current.confirm({ title: 'Test', message: 'Test message' })
    })

    expect(result.current.dialogProps.isOpen).toBe(true)
  })

  it('should set isOpen to false after onConfirm', () => {
    const { result } = renderHook(() => useConfirmDialog())

    act(() => {
      result.current.confirm({ title: 'Test', message: 'Test message' })
    })

    act(() => {
      result.current.dialogProps.onConfirm()
    })

    expect(result.current.dialogProps.isOpen).toBe(false)
  })

  it('should set isOpen to false after onCancel', () => {
    const { result } = renderHook(() => useConfirmDialog())

    act(() => {
      result.current.confirm({ title: 'Test', message: 'Test message' })
    })

    act(() => {
      result.current.dialogProps.onCancel()
    })

    expect(result.current.dialogProps.isOpen).toBe(false)
  })

  it('should pass title and message to dialog props', () => {
    const { result } = renderHook(() => useConfirmDialog())

    act(() => {
      result.current.confirm({ title: 'Delete Item', message: 'Are you sure?' })
    })

    expect(result.current.dialogProps.title).toBe('Delete Item')
    expect(result.current.dialogProps.message).toBe('Are you sure?')
  })

  it('should pass custom confirmLabel and cancelLabel', () => {
    const { result } = renderHook(() => useConfirmDialog())

    act(() => {
      result.current.confirm({
        title: 'Test',
        message: 'Test',
        confirmLabel: 'Delete',
        cancelLabel: 'Keep',
      })
    })

    expect(result.current.dialogProps.confirmLabel).toBe('Delete')
    expect(result.current.dialogProps.cancelLabel).toBe('Keep')
  })

  it('should handle concurrent calls by queuing', async () => {
    const { result } = renderHook(() => useConfirmDialog())

    let resolved1: boolean | undefined
    let resolved2: boolean | undefined

    act(() => {
      result.current.confirm({ title: 'First', message: 'First' }).then(v => { resolved1 = v })
    })

    // Second call while first is still open — the first should be resolved as false
    act(() => {
      result.current.confirm({ title: 'Second', message: 'Second' }).then(v => { resolved2 = v })
    })

    await vi.waitFor(() => expect(resolved1).toBe(false))
    expect(result.current.dialogProps.title).toBe('Second')

    act(() => {
      result.current.dialogProps.onConfirm()
    })

    await vi.waitFor(() => expect(resolved2).toBe(true))
  })
})

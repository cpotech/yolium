/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React, { useState } from 'react'
import { ConfirmDialog } from '@renderer/components/shared/ConfirmDialog'

vi.mock('@renderer/context/VimModeContext', () => ({
  useSuspendVimNavigation: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function HostWithButton() {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div data-testid="host" role="dialog" tabIndex={-1}>
      <button data-testid="trigger" onClick={() => setIsOpen(true)}>Open</button>
      <ConfirmDialog
        isOpen={isOpen}
        title="Confirm"
        message="Are you sure?"
        onConfirm={() => setIsOpen(false)}
        onCancel={() => setIsOpen(false)}
      />
    </div>
  )
}

function HostWithInput() {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div data-testid="host" role="dialog" tabIndex={-1}>
      <input data-testid="title-input" type="text" />
      <button data-testid="trigger" onClick={() => setIsOpen(true)}>Open</button>
      <ConfirmDialog
        isOpen={isOpen}
        title="Confirm"
        message="Are you sure?"
        onConfirm={() => setIsOpen(false)}
        onCancel={() => setIsOpen(false)}
      />
    </div>
  )
}

function HostWithTextarea() {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div data-testid="host" role="dialog" tabIndex={-1}>
      <textarea data-testid="desc-input" />
      <button data-testid="trigger" onClick={() => setIsOpen(true)}>Open</button>
      <ConfirmDialog
        isOpen={isOpen}
        title="Confirm"
        message="Are you sure?"
        onConfirm={() => setIsOpen(false)}
        onCancel={() => setIsOpen(false)}
      />
    </div>
  )
}

describe('ConfirmDialog focus restore', () => {
  it('should restore focus to the previously focused element when it is not an input/textarea', async () => {
    render(<HostWithButton />)
    const trigger = screen.getByTestId('trigger')

    // Focus the button (non-form-field), then open dialog
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    })

    // Focus moves into confirm dialog
    const confirmBtn = screen.getByTestId('confirm-dialog-confirm')
    act(() => { confirmBtn.focus() })

    // Close via cancel
    fireEvent.keyDown(screen.getByTestId('confirm-dialog-overlay'), { key: 'q', ctrlKey: true })

    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
    })

    // Focus should restore to the trigger button (non-form-field)
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('should focus the closest dialog ancestor instead of an input element when restoring focus', async () => {
    render(<HostWithInput />)
    const input = screen.getByTestId('title-input')
    const host = screen.getByTestId('host')

    // Focus the input, then open dialog
    input.focus()
    expect(document.activeElement).toBe(input)

    fireEvent.click(screen.getByTestId('trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    })

    const confirmBtn = screen.getByTestId('confirm-dialog-confirm')
    act(() => { confirmBtn.focus() })

    // Close via cancel
    fireEvent.keyDown(screen.getByTestId('confirm-dialog-overlay'), { key: 'q', ctrlKey: true })

    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
    })

    // Focus should go to the host dialog container, NOT the input
    await waitFor(() => {
      expect(document.activeElement).toBe(host)
    })
  })

  it('should focus the closest dialog ancestor instead of a textarea element when restoring focus', async () => {
    render(<HostWithTextarea />)
    const textarea = screen.getByTestId('desc-input')
    const host = screen.getByTestId('host')

    // Focus the textarea, then open dialog
    textarea.focus()
    expect(document.activeElement).toBe(textarea)

    fireEvent.click(screen.getByTestId('trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    })

    const confirmBtn = screen.getByTestId('confirm-dialog-confirm')
    act(() => { confirmBtn.focus() })

    // Close via cancel
    fireEvent.keyDown(screen.getByTestId('confirm-dialog-overlay'), { key: 'q', ctrlKey: true })

    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
    })

    // Focus should go to the host dialog container, NOT the textarea
    await waitFor(() => {
      expect(document.activeElement).toBe(host)
    })
  })

  it('should not restore focus when previousFocusRef is null', async () => {
    // Render with isOpen=false — no focus capture happens
    const onCancel = vi.fn()
    const { rerender } = render(
      <ConfirmDialog
        isOpen={false}
        title="Confirm"
        message="msg"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    )

    // No dialog rendered, no focus captured
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()

    // Re-render still closed — cleanup fires but previousFocusRef is null, no error
    rerender(
      <ConfirmDialog
        isOpen={false}
        title="Confirm"
        message="msg"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    )

    // No crash, no focus change
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
  })

  it('should still capture activeElement on open', async () => {
    render(<HostWithInput />)
    const input = screen.getByTestId('title-input')

    input.focus()
    expect(document.activeElement).toBe(input)

    fireEvent.click(screen.getByTestId('trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    })

    // The dialog is open — activeElement was captured (we verify by closing and checking restore)
    const confirmBtn = screen.getByTestId('confirm-dialog-confirm')
    act(() => { confirmBtn.focus() })

    // Close — focus goes to dialog ancestor (not input), proving capture happened
    fireEvent.keyDown(screen.getByTestId('confirm-dialog-overlay'), { key: 'q', ctrlKey: true })

    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
    })

    // Focus was captured and redirected to dialog ancestor
    const host = screen.getByTestId('host')
    await waitFor(() => {
      expect(document.activeElement).toBe(host)
    })
  })
})

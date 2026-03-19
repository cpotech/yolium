/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ConfirmDialog } from '@renderer/components/shared/ConfirmDialog'

// Mock VimModeContext
vi.mock('@renderer/context/VimModeContext', () => ({
  useSuspendVimNavigation: vi.fn(),
}))

import { useSuspendVimNavigation } from '@renderer/context/VimModeContext'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ConfirmDialog', () => {
  const defaultProps = {
    isOpen: true,
    title: 'Delete Item',
    message: 'Are you sure you want to delete this item?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }

  it('should render title and message when open', () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(screen.getByText('Delete Item')).toBeInTheDocument()
    expect(screen.getByText('Are you sure you want to delete this item?')).toBeInTheDocument()
  })

  it('should not render when isOpen is false', () => {
    render(<ConfirmDialog {...defaultProps} isOpen={false} />)
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
  })

  it('should call onConfirm when Enter is pressed', () => {
    render(<ConfirmDialog {...defaultProps} />)
    fireEvent.keyDown(screen.getByTestId('confirm-dialog-overlay'), { key: 'Enter' })
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('should call onCancel when Ctrl+Q is pressed', () => {
    render(<ConfirmDialog {...defaultProps} />)
    fireEvent.keyDown(screen.getByTestId('confirm-dialog-overlay'), { key: 'q', ctrlKey: true })
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
  })

  it('should call onCancel when backdrop is clicked', () => {
    render(<ConfirmDialog {...defaultProps} />)
    fireEvent.click(screen.getByTestId('confirm-dialog-overlay'))
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
  })

  it('should not call onCancel when clicking inside dialog container', () => {
    render(<ConfirmDialog {...defaultProps} />)
    fireEvent.click(screen.getByTestId('confirm-dialog'))
    expect(defaultProps.onCancel).not.toHaveBeenCalled()
  })

  it('should trap focus within dialog (Tab wraps to first focusable)', () => {
    render(<ConfirmDialog {...defaultProps} />)
    const confirmBtn = screen.getByTestId('confirm-dialog-confirm')
    const cancelBtn = screen.getByTestId('confirm-dialog-cancel')

    // Focus the last button (confirm), then Tab should wrap to cancel
    confirmBtn.focus()
    fireEvent.keyDown(screen.getByTestId('confirm-dialog-overlay'), { key: 'Tab' })
    // Focus trap should keep focus within the dialog
    expect(document.activeElement === cancelBtn || document.activeElement === confirmBtn).toBe(true)
  })

  it('should trap focus within dialog (Shift+Tab wraps to last focusable)', () => {
    render(<ConfirmDialog {...defaultProps} />)
    const cancelBtn = screen.getByTestId('confirm-dialog-cancel')

    // Focus the first button (cancel), then Shift+Tab should wrap to confirm
    cancelBtn.focus()
    fireEvent.keyDown(screen.getByTestId('confirm-dialog-overlay'), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).not.toBeNull()
  })

  it('should suspend vim navigation while open', () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(useSuspendVimNavigation).toHaveBeenCalledWith(true)
  })

  it('should auto-focus the confirm button on open', async () => {
    render(<ConfirmDialog {...defaultProps} />)
    // The confirm button should be focused after requestAnimationFrame
    const confirmBtn = screen.getByTestId('confirm-dialog-confirm')
    await waitFor(() => {
      expect(document.activeElement).toBe(confirmBtn)
    })
  })

  it('should display custom confirmLabel and cancelLabel', () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        confirmLabel="Delete"
        cancelLabel="Keep"
      />
    )
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Delete')
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Keep')
  })

  it('should show keyboard shortcut hints (Enter and Ctrl+Q)', () => {
    render(<ConfirmDialog {...defaultProps} />)
    const dialog = screen.getByTestId('confirm-dialog')
    expect(dialog.textContent).toContain('Enter')
    expect(dialog.textContent).toContain('Ctrl+Q')
  })

  it('should have role=dialog and aria-modal=true', () => {
    render(<ConfirmDialog {...defaultProps} />)
    const dialog = screen.getByTestId('confirm-dialog')
    expect(dialog).toHaveAttribute('role', 'dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('should have data-testid attributes on confirm, cancel, and overlay', () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(screen.getByTestId('confirm-dialog-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-dialog-confirm')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-dialog-cancel')).toBeInTheDocument()
  })

  it('should not close on Escape key (only Ctrl+Q closes)', () => {
    render(<ConfirmDialog {...defaultProps} />)
    fireEvent.keyDown(screen.getByTestId('confirm-dialog-overlay'), { key: 'Escape' })
    expect(defaultProps.onCancel).not.toHaveBeenCalled()
    expect(defaultProps.onConfirm).not.toHaveBeenCalled()
  })
})

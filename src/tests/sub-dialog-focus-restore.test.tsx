/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React, { useState } from 'react'
import { ConfirmDialog } from '@renderer/components/shared/ConfirmDialog'
import { GitDiffDialog } from '@renderer/components/code-review/GitDiffDialog'

// Mock VimModeContext
vi.mock('@renderer/context/VimModeContext', () => ({
  useSuspendVimNavigation: vi.fn(),
}))

// Mock electronAPI for GitDiffDialog
const mocks = {
  worktreeChangedFiles: vi.fn(),
  worktreeFileDiff: vi.fn(),
}

Object.defineProperty(window, 'electronAPI', {
  value: {
    git: {
      worktreeChangedFiles: mocks.worktreeChangedFiles,
      worktreeFileDiff: mocks.worktreeFileDiff,
    },
  },
  writable: true,
})

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
  mocks.worktreeChangedFiles.mockResolvedValue({ files: [], error: null })
  mocks.worktreeFileDiff.mockResolvedValue({ diff: '', error: null })
})

/**
 * Helper: renders a container div (simulating ItemDetailDialog) with a button
 * that opens a sub-dialog. The container has tabIndex={-1} so it can receive focus.
 */
function ConfirmDialogHost() {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div data-testid="host-container" tabIndex={-1}>
      <button data-testid="open-btn" onClick={() => setIsOpen(true)}>
        Open
      </button>
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

function GitDiffDialogHost() {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div data-testid="host-container" tabIndex={-1}>
      <button data-testid="open-btn" onClick={() => setIsOpen(true)}>
        Open
      </button>
      <GitDiffDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        projectPath="/test/project"
        branchName="feature/test"
      />
    </div>
  )
}

describe('Sub-dialog focus restore', () => {
  describe('ConfirmDialog', () => {
    it('should restore focus to ItemDetailDialog container after ConfirmDialog closes via Ctrl+Q', async () => {
      render(<ConfirmDialogHost />)
      const container = screen.getByTestId('host-container')

      // Focus the container (simulating ItemDetailDialog having focus)
      container.focus()
      expect(document.activeElement).toBe(container)

      // Open the sub-dialog
      fireEvent.click(screen.getByTestId('open-btn'))
      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
      })

      // Simulate what happens in a real browser: focus moves into the dialog
      const confirmBtn = screen.getByTestId('confirm-dialog-confirm')
      act(() => { confirmBtn.focus() })
      expect(document.activeElement).toBe(confirmBtn)

      // Close with Ctrl+Q
      fireEvent.keyDown(screen.getByTestId('confirm-dialog-overlay'), {
        key: 'q',
        ctrlKey: true,
      })

      // ConfirmDialog should be gone
      await waitFor(() => {
        expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
      })

      // Focus should be restored to the container
      await waitFor(() => {
        expect(document.activeElement).toBe(container)
      })
    })

    it('should restore focus when ConfirmDialog closes via cancel button click', async () => {
      render(<ConfirmDialogHost />)
      const container = screen.getByTestId('host-container')

      container.focus()
      expect(document.activeElement).toBe(container)

      fireEvent.click(screen.getByTestId('open-btn'))
      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
      })

      // Simulate focus moving into the dialog
      const cancelBtn = screen.getByTestId('confirm-dialog-cancel')
      act(() => { cancelBtn.focus() })
      expect(document.activeElement).toBe(cancelBtn)

      // Click the cancel button
      fireEvent.click(cancelBtn)

      await waitFor(() => {
        expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
      })

      await waitFor(() => {
        expect(document.activeElement).toBe(container)
      })
    })

    it('should not restore focus if the sub-dialog was never focused', async () => {
      // When ConfirmDialog is rendered with isOpen=false and never opens,
      // no focus capture or restore should happen
      const { rerender } = render(
        <div data-testid="host-container" tabIndex={-1}>
          <ConfirmDialog
            isOpen={false}
            title="Confirm"
            message="Are you sure?"
            onConfirm={vi.fn()}
            onCancel={vi.fn()}
          />
        </div>
      )

      const container = screen.getByTestId('host-container')
      container.focus()
      expect(document.activeElement).toBe(container)

      // Re-render still closed - focus should stay on container, no restore triggered
      rerender(
        <div data-testid="host-container" tabIndex={-1}>
          <ConfirmDialog
            isOpen={false}
            title="Confirm"
            message="Are you sure?"
            onConfirm={vi.fn()}
            onCancel={vi.fn()}
          />
        </div>
      )

      expect(document.activeElement).toBe(container)
    })
  })

  describe('GitDiffDialog', () => {
    it('should restore focus to ItemDetailDialog container after GitDiffDialog closes via onClose', async () => {
      render(<GitDiffDialogHost />)
      const container = screen.getByTestId('host-container')

      container.focus()
      expect(document.activeElement).toBe(container)

      // Open the diff dialog
      fireEvent.click(screen.getByTestId('open-btn'))
      await waitFor(() => {
        expect(screen.getByTestId('git-diff-dialog')).toBeInTheDocument()
      })

      // Simulate focus moving into the dialog
      const closeBtn = screen.getByTestId('diff-dialog-close')
      act(() => { closeBtn.focus() })
      expect(document.activeElement).toBe(closeBtn)

      // Close with Ctrl+Q
      fireEvent.keyDown(screen.getByTestId('git-diff-dialog'), {
        key: 'q',
        ctrlKey: true,
      })

      await waitFor(() => {
        expect(screen.queryByTestId('git-diff-dialog')).not.toBeInTheDocument()
      })

      await waitFor(() => {
        expect(document.activeElement).toBe(container)
      })
    })

    it('should restore focus when GitDiffDialog closes via close button click', async () => {
      render(<GitDiffDialogHost />)
      const container = screen.getByTestId('host-container')

      container.focus()
      expect(document.activeElement).toBe(container)

      fireEvent.click(screen.getByTestId('open-btn'))
      await waitFor(() => {
        expect(screen.getByTestId('git-diff-dialog')).toBeInTheDocument()
      })

      // Simulate focus moving into the dialog
      const closeBtn = screen.getByTestId('diff-dialog-close')
      act(() => { closeBtn.focus() })
      expect(document.activeElement).toBe(closeBtn)

      // Click the close button (X icon)
      fireEvent.click(closeBtn)

      await waitFor(() => {
        expect(screen.queryByTestId('git-diff-dialog')).not.toBeInTheDocument()
      })

      await waitFor(() => {
        expect(document.activeElement).toBe(container)
      })
    })
  })
})

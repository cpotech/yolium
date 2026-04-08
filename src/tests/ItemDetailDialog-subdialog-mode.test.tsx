/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React, { useState, useCallback } from 'react'
import { ConfirmDialog } from '@renderer/components/shared/ConfirmDialog'
import { GitDiffDialog } from '@renderer/components/code-review/GitDiffDialog'

vi.mock('@renderer/context/VimModeContext', () => ({
  useSuspendVimNavigation: vi.fn(),
}))

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
 * Simulates the ItemDetailDialog pattern: a dialog container with form fields
 * that call enterInsertMode on focus, and sub-dialogs that restore focus on close.
 */
function ItemDetailSimulator({ subDialog }: { subDialog: 'confirm' | 'gitdiff' }) {
  const [mode, setMode] = useState<'NORMAL' | 'INSERT'>('NORMAL')
  const [subOpen, setSubOpen] = useState(false)

  const handleFieldFocus = useCallback(() => {
    setMode('INSERT')
  }, [])

  return (
    <div data-testid="item-dialog" role="dialog" tabIndex={-1}>
      <div data-testid="mode-display">{mode}</div>
      <input
        data-testid="title-input"
        type="text"
        onFocus={handleFieldFocus}
      />
      <textarea
        data-testid="desc-input"
        onFocus={handleFieldFocus}
      />
      <button data-testid="open-sub" onClick={() => setSubOpen(true)}>Open Sub</button>
      <button data-testid="set-normal" onClick={() => setMode('NORMAL')}>Normal</button>

      {subDialog === 'confirm' && (
        <ConfirmDialog
          isOpen={subOpen}
          title="Confirm"
          message="Are you sure?"
          onConfirm={() => setSubOpen(false)}
          onCancel={() => setSubOpen(false)}
        />
      )}
      {subDialog === 'gitdiff' && (
        <GitDiffDialog
          isOpen={subOpen}
          onClose={() => setSubOpen(false)}
          projectPath="/test"
          branchName="test-branch"
        />
      )}
    </div>
  )
}

describe('ItemDetailDialog sub-dialog mode preservation', () => {
  it('should remain in NORMAL mode after ConfirmDialog closes when previous focus was a field', async () => {
    render(<ItemDetailSimulator subDialog="confirm" />)

    const input = screen.getByTestId('title-input')

    // Focus input via fireEvent to trigger React's onFocus → INSERT mode
    fireEvent.focus(input)
    expect(screen.getByTestId('mode-display')).toHaveTextContent('INSERT')

    // Switch to NORMAL mode (simulating Escape)
    fireEvent.click(screen.getByTestId('set-normal'))
    expect(screen.getByTestId('mode-display')).toHaveTextContent('NORMAL')

    // Focus the input so it's activeElement when sub-dialog captures focus
    act(() => { input.focus() })

    // Open the sub-dialog — ConfirmDialog captures document.activeElement (the input)
    fireEvent.click(screen.getByTestId('open-sub'))
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    })

    // Ensure we're in NORMAL mode while sub-dialog is open
    fireEvent.click(screen.getByTestId('set-normal'))
    expect(screen.getByTestId('mode-display')).toHaveTextContent('NORMAL')

    // Close the sub-dialog — focus restore should NOT re-focus the input
    fireEvent.keyDown(screen.getByTestId('confirm-dialog-overlay'), { key: 'q', ctrlKey: true })

    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
    })

    // CRITICAL: mode should still be NORMAL — focus was not restored to the input
    await waitFor(() => {
      expect(screen.getByTestId('mode-display')).toHaveTextContent('NORMAL')
    })
  })

  it('should remain in NORMAL mode after GitDiffDialog closes when previous focus was a field', async () => {
    render(<ItemDetailSimulator subDialog="gitdiff" />)

    const input = screen.getByTestId('title-input')

    // Focus input to trigger INSERT, then go back to NORMAL
    fireEvent.focus(input)
    expect(screen.getByTestId('mode-display')).toHaveTextContent('INSERT')
    fireEvent.click(screen.getByTestId('set-normal'))
    expect(screen.getByTestId('mode-display')).toHaveTextContent('NORMAL')

    // Focus the input so it's activeElement when sub-dialog captures focus
    act(() => { input.focus() })

    // Open sub-dialog
    fireEvent.click(screen.getByTestId('open-sub'))
    await waitFor(() => {
      expect(screen.getByTestId('git-diff-dialog')).toBeInTheDocument()
    })

    // Ensure NORMAL mode while sub-dialog is open
    fireEvent.click(screen.getByTestId('set-normal'))
    expect(screen.getByTestId('mode-display')).toHaveTextContent('NORMAL')

    // Close GitDiffDialog
    fireEvent.keyDown(screen.getByTestId('git-diff-dialog'), { key: 'q', ctrlKey: true })

    await waitFor(() => {
      expect(screen.queryByTestId('git-diff-dialog')).not.toBeInTheDocument()
    })

    // Mode should still be NORMAL
    await waitFor(() => {
      expect(screen.getByTestId('mode-display')).toHaveTextContent('NORMAL')
    })
  })

  it('should correctly enter INSERT mode when user explicitly focuses a field via click', async () => {
    render(<ItemDetailSimulator subDialog="confirm" />)

    expect(screen.getByTestId('mode-display')).toHaveTextContent('NORMAL')

    // User clicks/focuses input — should enter INSERT mode
    fireEvent.focus(screen.getByTestId('title-input'))

    expect(screen.getByTestId('mode-display')).toHaveTextContent('INSERT')
  })
})

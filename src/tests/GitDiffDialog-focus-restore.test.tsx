/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React, { useState } from 'react'
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

function HostWithButton() {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div data-testid="host" role="dialog" tabIndex={-1}>
      <button data-testid="trigger" onClick={() => setIsOpen(true)}>Open</button>
      <GitDiffDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        projectPath="/test/project"
        branchName="feature/test"
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
      <GitDiffDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        projectPath="/test/project"
        branchName="feature/test"
      />
    </div>
  )
}

function HostWithContentEditable() {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div data-testid="host" role="dialog" tabIndex={-1}>
      <div data-testid="editable" contentEditable={true} tabIndex={0}>editable</div>
      <button data-testid="trigger" onClick={() => setIsOpen(true)}>Open</button>
      <GitDiffDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        projectPath="/test/project"
        branchName="feature/test"
      />
    </div>
  )
}

describe('GitDiffDialog focus restore', () => {
  it('should restore focus to the previously focused element when it is not an input/textarea', async () => {
    render(<HostWithButton />)
    const trigger = screen.getByTestId('trigger')

    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    await waitFor(() => {
      expect(screen.getByTestId('git-diff-dialog')).toBeInTheDocument()
    })

    // Focus moves into the diff dialog
    const closeBtn = screen.getByTestId('diff-dialog-close')
    act(() => { closeBtn.focus() })

    // Close via Ctrl+Q
    fireEvent.keyDown(screen.getByTestId('git-diff-dialog'), { key: 'q', ctrlKey: true })

    await waitFor(() => {
      expect(screen.queryByTestId('git-diff-dialog')).not.toBeInTheDocument()
    })

    // Focus should restore to the trigger button
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('should focus the closest dialog ancestor instead of an input when restoring focus', async () => {
    render(<HostWithInput />)
    const input = screen.getByTestId('title-input')
    const host = screen.getByTestId('host')

    input.focus()
    expect(document.activeElement).toBe(input)

    fireEvent.click(screen.getByTestId('trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('git-diff-dialog')).toBeInTheDocument()
    })

    const closeBtn = screen.getByTestId('diff-dialog-close')
    act(() => { closeBtn.focus() })

    fireEvent.keyDown(screen.getByTestId('git-diff-dialog'), { key: 'q', ctrlKey: true })

    await waitFor(() => {
      expect(screen.queryByTestId('git-diff-dialog')).not.toBeInTheDocument()
    })

    // Focus should go to the host dialog container, NOT the input
    await waitFor(() => {
      expect(document.activeElement).toBe(host)
    })
  })

  it('should not call focus on the previously active element if it is a contentEditable element', async () => {
    render(<HostWithContentEditable />)
    const editable = screen.getByTestId('editable')
    const host = screen.getByTestId('host')

    editable.focus()
    expect(document.activeElement).toBe(editable)

    fireEvent.click(screen.getByTestId('trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('git-diff-dialog')).toBeInTheDocument()
    })

    const closeBtn = screen.getByTestId('diff-dialog-close')
    act(() => { closeBtn.focus() })

    fireEvent.keyDown(screen.getByTestId('git-diff-dialog'), { key: 'q', ctrlKey: true })

    await waitFor(() => {
      expect(screen.queryByTestId('git-diff-dialog')).not.toBeInTheDocument()
    })

    // Focus should go to the host dialog container, NOT the contentEditable
    await waitFor(() => {
      expect(document.activeElement).toBe(host)
    })
  })
})

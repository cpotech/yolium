/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GitCloneInput } from '@renderer/components/navigation/GitCloneInput'

const CLONE_HANDLER_UNAVAILABLE_MESSAGE = 'Git clone is temporarily unavailable. Please restart Yolium and try again.'

function setCloneMock(cloneMock: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: {
      ...(window.electronAPI || {}),
      git: {
        ...(window.electronAPI?.git || {}),
        clone: cloneMock,
      },
    },
  })
}

describe('GitCloneInput', () => {
  const onCloned = vi.fn()
  const onCancel = vi.fn()
  const inputRef = { current: document.createElement('input') }

  beforeEach(() => {
    vi.clearAllMocks()
    setCloneMock(vi.fn().mockResolvedValue({ success: true, clonedPath: '/tmp/projects/repo', error: null }))
  })

  it('shows a stable error message when git:clone handler is missing and preserves retry state', async () => {
    const cloneMock = vi.fn().mockRejectedValue(
      new Error("Error invoking remote method 'git:clone': No handler registered for 'git:clone'"),
    )
    setCloneMock(cloneMock)

    render(
      <GitCloneInput
        parentDirectory="/tmp/projects"
        onCloned={onCloned}
        onCancel={onCancel}
        inputRef={inputRef}
      />,
    )

    const urlInput = screen.getByPlaceholderText('Repository URL (https://... or git@...)')
    const confirmButton = screen.getByLabelText('Confirm clone')

    fireEvent.change(urlInput, { target: { value: 'https://github.com/user/repo.git' } })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(screen.getByText(CLONE_HANDLER_UNAVAILABLE_MESSAGE)).toBeInTheDocument()
    })

    expect(onCloned).not.toHaveBeenCalled()
    expect(confirmButton).not.toBeDisabled()
    expect(urlInput).toHaveValue('https://github.com/user/repo.git')
    expect(cloneMock).toHaveBeenCalledWith('https://github.com/user/repo.git', '/tmp/projects/repo')
  })

  it('shows the thrown clone error for non-handler failures', async () => {
    const cloneMock = vi.fn().mockRejectedValue(new Error('fatal: repository not found'))
    setCloneMock(cloneMock)

    render(
      <GitCloneInput
        parentDirectory="/tmp/projects"
        onCloned={onCloned}
        onCancel={onCancel}
        inputRef={inputRef}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Repository URL (https://... or git@...)'), {
      target: { value: 'https://github.com/user/repo.git' },
    })
    fireEvent.click(screen.getByLabelText('Confirm clone'))

    await waitFor(() => {
      expect(screen.getByText('fatal: repository not found')).toBeInTheDocument()
    })
  })
})

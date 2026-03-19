/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { GitDiffDialog } from '@renderer/components/code-review/GitDiffDialog'

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
  vi.restoreAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
  mocks.worktreeChangedFiles.mockResolvedValue({ files: [], error: null })
  mocks.worktreeFileDiff.mockResolvedValue({ diff: '', error: null })
})

function renderGitDiffDialog(overrides: Partial<Parameters<typeof GitDiffDialog>[0]> = {}) {
  return render(
    <GitDiffDialog
      isOpen={true}
      projectPath="/test/project"
      branchName="feature/test"
      onClose={overrides.onClose ?? vi.fn()}
      {...overrides}
    />,
  )
}

describe('GitDiffDialog', () => {
  it('should render when isOpen is true', () => {
    renderGitDiffDialog()
    expect(screen.getByTestId('git-diff-dialog')).toBeInTheDocument()
  })

  it('should not render when isOpen is false', () => {
    renderGitDiffDialog({ isOpen: false })
    expect(screen.queryByTestId('git-diff-dialog')).not.toBeInTheDocument()
  })

  it('should load changed files on open', async () => {
    mocks.worktreeChangedFiles.mockResolvedValue({
      files: [
        { path: 'src/foo.ts', status: 'M' },
        { path: 'src/bar.ts', status: 'A' },
      ],
      error: null,
    })
    renderGitDiffDialog()
    await act(async () => {})
    expect(mocks.worktreeChangedFiles).toHaveBeenCalledWith('/test/project', 'feature/test')
  })

  it('should display keyboard hints in header', async () => {
    renderGitDiffDialog()
    expect(screen.getByText('navigate')).toBeInTheDocument()
    expect(screen.getByText('q')).toBeInTheDocument()
  })
})

describe('GitDiffDialog j/k navigation', () => {
  const mockFiles = [
    { path: 'src/foo.ts', status: 'M' as const },
    { path: 'src/bar.ts', status: 'A' as const },
    { path: 'src/baz.ts', status: 'D' as const },
  ]

  it('should navigate to next file when j is pressed', async () => {
    mocks.worktreeChangedFiles.mockResolvedValue({ files: mockFiles, error: null })
    mocks.worktreeFileDiff.mockResolvedValue({ diff: '', error: null })
    renderGitDiffDialog()
    await act(async () => {})

    const dialog = screen.getByTestId('git-diff-dialog')
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'j' })
    })

    const secondFile = screen.getByTestId('diff-file-src/bar.ts')
    expect(secondFile.className).toMatch(/ring/)
  })

  it('should not navigate when no files are loaded', async () => {
    mocks.worktreeFileDiff.mockResolvedValue({ diff: '', error: null })
    renderGitDiffDialog()
    await act(async () => {})

    mocks.worktreeFileDiff.mockClear()
    const dialog = screen.getByTestId('git-diff-dialog')

    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'j' })
      fireEvent.keyDown(dialog, { key: 'k' })
    })

    expect(mocks.worktreeFileDiff).not.toHaveBeenCalled()
  })

  it('should call scrollIntoView when navigating', async () => {
    mocks.worktreeChangedFiles.mockResolvedValue({ files: mockFiles, error: null })
    mocks.worktreeFileDiff.mockResolvedValue({ diff: '', error: null })
    renderGitDiffDialog()
    await act(async () => {})

    const dialog = screen.getByTestId('git-diff-dialog')
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'j' })
    })

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})

describe('GitDiffDialog Ctrl+Q close', () => {
  it('should close dialog when Ctrl+Q is pressed', async () => {
    const onClose = vi.fn()
    renderGitDiffDialog({ onClose })
    await act(async () => {})

    const dialog = screen.getByTestId('git-diff-dialog')

    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'q', ctrlKey: true })
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should stop propagation on Ctrl+Q so parent dialogs are not closed', async () => {
    const onClose = vi.fn()
    renderGitDiffDialog({ onClose })
    await act(async () => {})

    const dialog = screen.getByTestId('git-diff-dialog')
    let propagationStopped = false

    const event = new KeyboardEvent('keydown', {
      key: 'q',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'stopPropagation', {
      value: () => { propagationStopped = true },
      writable: false,
    })

    await act(async () => {
      dialog.dispatchEvent(event)
    })

    expect(propagationStopped).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

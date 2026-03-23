/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GitDiffDialog } from '@renderer/components/code-review/GitDiffDialog';

const mockOnClose = vi.fn();

const mockGitWorktreeChangedFiles = vi.fn().mockResolvedValue({
  files: [
    { path: 'src/foo.ts', status: 'modified' as const },
    { path: 'src/bar.ts', status: 'added' as const },
  ],
  unifiedDiff: 'mock diff content',
});

const mockWorktreeFileDiff = vi.fn().mockResolvedValue({
  diff: 'mock file diff',
  error: null,
});

const mockElectronApi = {
  git: {
    worktreeChangedFiles: mockGitWorktreeChangedFiles,
    worktreeFileDiff: mockWorktreeFileDiff,
  },
};

const defaultProps = {
  isOpen: true,
  onClose: mockOnClose,
  branchName: 'feature/test',
  projectPath: '/test/project',
};

describe('GitDiffDialog Keyboard Shortcuts', () => {
  beforeEach(() => {
    mockOnClose.mockClear();
    mockGitWorktreeChangedFiles.mockClear();
    mockWorktreeFileDiff.mockClear();
    Element.prototype.scrollIntoView = vi.fn();
    (window as unknown as { electronAPI: typeof mockElectronApi }).electronAPI = mockElectronApi;
  });

  it('should close when pressing lowercase q', async () => {
    await act(async () => {
      render(<GitDiffDialog {...defaultProps} />);
    });
    const dialog = screen.getByTestId('git-diff-dialog');
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'q' });
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should close when pressing uppercase Q', async () => {
    await act(async () => {
      render(<GitDiffDialog {...defaultProps} />);
    });
    const dialog = screen.getByTestId('git-diff-dialog');
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'Q' });
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should close when pressing Ctrl+Q', async () => {
    await act(async () => {
      render(<GitDiffDialog {...defaultProps} />);
    });
    const dialog = screen.getByTestId('git-diff-dialog');
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'q', ctrlKey: true });
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should close when pressing Cmd+Q (macOS)', async () => {
    await act(async () => {
      render(<GitDiffDialog {...defaultProps} />);
    });
    const dialog = screen.getByTestId('git-diff-dialog');
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'q', metaKey: true });
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should not close when pressing other keys', async () => {
    await act(async () => {
      render(<GitDiffDialog {...defaultProps} />);
    });
    const dialog = screen.getByTestId('git-diff-dialog');
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'Escape' });
    });
    expect(mockOnClose).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'w' });
    });
    expect(mockOnClose).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'Enter' });
    });
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should show q shortcut hint in header', async () => {
    await act(async () => {
      render(<GitDiffDialog {...defaultProps} />);
    });
    const shortcutHint = screen.getByText('q');
    expect(shortcutHint).toBeInTheDocument();
  });

  it('should auto-focus the dialog container when opened', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<GitDiffDialog {...defaultProps} />);
    });
    await act(async () => {
      vi.runAllTimers();
    });
    const dialog = screen.getByTestId('git-diff-dialog');
    expect(dialog).toHaveFocus();
    vi.useRealTimers();
  });

  it('should have tabIndex=-1 on the dialog container', async () => {
    await act(async () => {
      render(<GitDiffDialog {...defaultProps} />);
    });
    const dialog = screen.getByTestId('git-diff-dialog');
    expect(dialog).toHaveAttribute('tabindex', '-1');
  });

  it('should navigate to next file when pressing j', async () => {
    await act(async () => {
      render(<GitDiffDialog {...defaultProps} />);
    });
    // Wait for files to load
    await screen.findByTestId('diff-file-src/foo.ts');
    const dialog = screen.getByTestId('git-diff-dialog');
    // First file should be selected initially
    const firstFile = screen.getByTestId('diff-file-src/foo.ts');
    expect(firstFile.className).toContain('bg-[var(--color-bg-primary)]');
    // Press j to navigate to next file
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'j' });
    });
    const secondFile = screen.getByTestId('diff-file-src/bar.ts');
    expect(secondFile.className).toContain('bg-[var(--color-bg-primary)]');
  });

  it('should navigate to previous file when pressing k', async () => {
    await act(async () => {
      render(<GitDiffDialog {...defaultProps} />);
    });
    await screen.findByTestId('diff-file-src/foo.ts');
    const dialog = screen.getByTestId('git-diff-dialog');
    // Navigate to second file first
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'j' });
    });
    // Press k to go back
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'k' });
    });
    const firstFile = screen.getByTestId('diff-file-src/foo.ts');
    expect(firstFile.className).toContain('bg-[var(--color-bg-primary)]');
  });
});

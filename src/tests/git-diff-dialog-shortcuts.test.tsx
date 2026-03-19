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
});

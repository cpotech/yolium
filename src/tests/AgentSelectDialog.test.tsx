/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentSelectDialog } from '@renderer/components/agent/AgentSelectDialog';
import type { ProjectType } from '@shared/types/onboarding';

function setupElectronApi(overrides: {
  initResult?: { success: boolean; error?: string };
  initError?: Error;
  detectedTypes?: ProjectType[];
}) {
  const initMock = overrides.initError
    ? vi.fn().mockRejectedValue(overrides.initError)
    : vi.fn().mockResolvedValue(overrides.initResult ?? { success: true, initialized: true });
  const initRepoMock = vi.fn();
  const detectProjectMock = vi.fn().mockResolvedValue(overrides.detectedTypes ?? ['nodejs']);

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: {
      git: {
        init: initMock,
        initRepo: initRepoMock,
        validateBranch: vi.fn().mockResolvedValue({ valid: true, error: null }),
      },
      onboarding: {
        detectProject: detectProjectMock,
      },
    },
  });

  return { initMock, initRepoMock, detectProjectMock };
}

describe('AgentSelectDialog git initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls git.init (not initRepo) and passes detected project types', async () => {
    const { initMock, initRepoMock, detectProjectMock } = setupElectronApi({
      detectedTypes: ['nodejs', 'python'],
    });
    const onGitInit = vi.fn();

    render(
      <AgentSelectDialog
        isOpen
        folderPath="/tmp/project"
        gitStatus={{ isRepo: false, hasCommits: false }}
        onSelect={vi.fn()}
        onBack={vi.fn()}
        onCancel={vi.fn()}
        onGitInit={onGitInit}
      />,
    );

    fireEvent.click(screen.getByTestId('init-git-button'));

    await waitFor(() => {
      expect(detectProjectMock).toHaveBeenCalledWith('/tmp/project');
      expect(initMock).toHaveBeenCalledWith('/tmp/project', ['nodejs', 'python']);
      expect(onGitInit).toHaveBeenCalledTimes(1);
    });
    expect(initRepoMock).not.toHaveBeenCalled();
  });

  it('shows init error from failed git initialization response', async () => {
    setupElectronApi({
      initResult: { success: false, error: 'Failed to initialize git' },
    });

    render(
      <AgentSelectDialog
        isOpen
        folderPath="/tmp/project"
        gitStatus={{ isRepo: false, hasCommits: false }}
        onSelect={vi.fn()}
        onBack={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('init-git-button'));

    await waitFor(() => {
      expect(screen.getByText('Failed to initialize git')).toBeInTheDocument();
    });
  });

  it('shows init error when git.init throws', async () => {
    setupElectronApi({
      initError: new Error('Permission denied'),
    });

    render(
      <AgentSelectDialog
        isOpen
        folderPath="/tmp/project"
        gitStatus={{ isRepo: false, hasCommits: false }}
        onSelect={vi.fn()}
        onBack={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('init-git-button'));

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeInTheDocument();
    });
  });
});

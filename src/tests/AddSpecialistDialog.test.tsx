/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddSpecialistDialog } from '@renderer/components/schedule/AddSpecialistDialog';

const mockScaffold = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockScaffold.mockResolvedValue({ filePath: '/tmp/agents/cron/code-quality.md' });

  Object.defineProperty(window, 'electronAPI', {
    value: {
      schedule: {
        scaffold: mockScaffold,
      },
    },
    writable: true,
  });
});

describe('AddSpecialistDialog', () => {
  it('should not render when isOpen is false', () => {
    render(<AddSpecialistDialog isOpen={false} onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.queryByTestId('add-specialist-dialog')).not.toBeInTheDocument();
  });

  it('should render name and description inputs when open', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByTestId('add-specialist-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('specialist-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('specialist-description-input')).toBeInTheDocument();
  });

  it('should disable Create button when name is empty', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByTestId('specialist-create-btn')).toBeDisabled();
  });

  it('should enable Create button when name is provided', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByTestId('specialist-name-input'), {
      target: { value: 'code-quality' },
    });

    expect(screen.getByTestId('specialist-create-btn')).toBeEnabled();
  });

  it('should call scaffold IPC with name and description on submit', async () => {
    const onCreated = vi.fn();

    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={onCreated} />);

    fireEvent.change(screen.getByTestId('specialist-name-input'), {
      target: { value: 'code-quality' },
    });
    fireEvent.change(screen.getByTestId('specialist-description-input'), {
      target: { value: 'Monitors code quality and risky diffs' },
    });

    fireEvent.click(screen.getByTestId('specialist-create-btn'));

    await waitFor(() => {
      expect(mockScaffold).toHaveBeenCalledWith('code-quality', {
        description: 'Monitors code quality and risky diffs',
      });
      expect(onCreated).toHaveBeenCalledTimes(1);
    });
  });

  it('should show error message when scaffold fails with duplicate name', async () => {
    mockScaffold.mockRejectedValueOnce(new Error('Specialist "code-quality" already exists'));

    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByTestId('specialist-name-input'), {
      target: { value: 'code-quality' },
    });

    fireEvent.click(screen.getByTestId('specialist-create-btn'));

    await waitFor(() => {
      expect(screen.getByText('Specialist "code-quality" already exists')).toBeInTheDocument();
    });
  });

  it('should close dialog after successful creation', async () => {
    const onCreated = vi.fn();

    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={onCreated} />);

    fireEvent.change(screen.getByTestId('specialist-name-input'), {
      target: { value: 'security-monitor' },
    });

    fireEvent.click(screen.getByTestId('specialist-create-btn'));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });
  });

  it('should sanitize name input to kebab-case', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    const nameInput = screen.getByTestId('specialist-name-input');
    fireEvent.change(nameInput, {
      target: { value: '  My_Specialist!! 2026  ' },
    });
    fireEvent.blur(nameInput);

    expect(nameInput).toHaveValue('my-specialist-2026');
  });

  it('should call onClose when Escape is pressed', () => {
    const onClose = vi.fn();

    render(<AddSpecialistDialog isOpen={true} onClose={onClose} onCreated={vi.fn()} />);

    fireEvent.keyDown(screen.getByTestId('add-specialist-dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when backdrop is clicked', () => {
    const onClose = vi.fn();

    render(<AddSpecialistDialog isOpen={true} onClose={onClose} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByTestId('add-specialist-dialog'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when Cancel is clicked', () => {
    const onClose = vi.fn();

    render(<AddSpecialistDialog isOpen={true} onClose={onClose} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByTestId('specialist-cancel-btn'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

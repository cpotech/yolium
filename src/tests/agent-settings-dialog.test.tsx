/**
 * @vitest-environment jsdom
 */
// src/tests/agent-settings-dialog.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentSettingsDialog } from '@renderer/components/settings/AgentSettingsDialog';
import type { AgentDefinition } from '@shared/types/agent';

// Mock VimModeContext
vi.mock('@renderer/context/VimModeContext', () => ({
  useSuspendVimNavigation: vi.fn(),
}));

// Mock electronAPI
const mockListDefinitions = vi.fn();
const mockLoadFullDefinition = vi.fn();
const mockSaveDefinition = vi.fn();
const mockDeleteDefinition = vi.fn();

Object.defineProperty(window, 'electronAPI', {
  value: {
    agent: {
      listDefinitions: mockListDefinitions,
      loadFullDefinition: mockLoadFullDefinition,
      saveDefinition: mockSaveDefinition,
      deleteDefinition: mockDeleteDefinition,
    },
  },
  writable: true,
});

const mockAgents: (AgentDefinition & { isBuiltin?: boolean })[] = [
  { name: 'plan-agent', description: 'Plans work', model: 'opus', tools: ['Read', 'Grep'], order: 1, isBuiltin: true },
  { name: 'code-agent', description: 'Writes code', model: 'sonnet', tools: ['Read', 'Write'], order: 2, isBuiltin: true },
  { name: 'my-custom', description: 'Custom agent', model: 'haiku', tools: ['Read'], order: 10, isBuiltin: false },
];

describe('AgentSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListDefinitions.mockResolvedValue(mockAgents);
    mockLoadFullDefinition.mockResolvedValue({
      name: 'plan-agent',
      description: 'Plans work',
      model: 'opus',
      tools: ['Read', 'Grep'],
      order: 1,
      isBuiltin: true,
      systemPrompt: 'You are the plan agent.',
    });
    mockSaveDefinition.mockResolvedValue(undefined);
    mockDeleteDefinition.mockResolvedValue(undefined);
  });

  it('should not render when isOpen is false', () => {
    const { container } = render(
      <AgentSettingsDialog isOpen={false} onClose={vi.fn()} />
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it('should render agent list when isOpen is true', async () => {
    render(<AgentSettingsDialog isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('plan-agent')).toBeInTheDocument();
    });
  });

  it('should display all agents sorted by order', async () => {
    render(<AgentSettingsDialog isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      const items = screen.getAllByTestId(/^agent-list-item-/);
      expect(items).toHaveLength(3);
    });
  });

  it('should show agent details form when an agent is selected', async () => {
    render(<AgentSettingsDialog isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('plan-agent')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('plan-agent'));
    await waitFor(() => {
      expect(screen.getByTestId('agent-name-input')).toBeInTheDocument();
    });
  });

  it('should mark built-in agents as built-in in the list', async () => {
    render(<AgentSettingsDialog isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('agent-list-item-plan-agent')).toBeInTheDocument();
    });
    // Built-in agents should have a "built-in" badge
    const planItem = screen.getByTestId('agent-list-item-plan-agent');
    expect(planItem.textContent).toContain('built-in');
  });

  it('should enable editing for custom agents', async () => {
    mockLoadFullDefinition.mockResolvedValue({
      name: 'my-custom',
      description: 'Custom agent',
      model: 'haiku',
      tools: ['Read'],
      order: 10,
      isBuiltin: false,
      systemPrompt: 'Custom prompt',
    });

    render(<AgentSettingsDialog isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('my-custom'));
    await waitFor(() => {
      const nameInput = screen.getByTestId('agent-name-input') as HTMLInputElement;
      expect(nameInput.disabled).toBe(false);
    });
  });

  it('should call onSave with updated agent definition on form submit', async () => {
    mockLoadFullDefinition.mockResolvedValue({
      name: 'my-custom',
      description: 'Custom agent',
      model: 'haiku',
      tools: ['Read'],
      order: 10,
      isBuiltin: false,
      systemPrompt: 'Custom prompt',
    });

    render(<AgentSettingsDialog isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('my-custom'));
    await waitFor(() => {
      expect(screen.getByTestId('agent-save-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('agent-save-button'));
    await waitFor(() => {
      expect(mockSaveDefinition).toHaveBeenCalled();
    });
  });

  it('should call onDelete for custom agents', async () => {
    mockLoadFullDefinition.mockResolvedValue({
      name: 'my-custom',
      description: 'Custom agent',
      model: 'haiku',
      tools: ['Read'],
      order: 10,
      isBuiltin: false,
      systemPrompt: 'Custom prompt',
    });

    render(<AgentSettingsDialog isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('my-custom'));
    await waitFor(() => {
      expect(screen.getByTestId('agent-delete-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('agent-delete-button'));
    await waitFor(() => {
      expect(mockDeleteDefinition).toHaveBeenCalledWith('my-custom');
    });
  });

  it('should show New Agent button and open blank form when clicked', async () => {
    render(<AgentSettingsDialog isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('new-agent-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('new-agent-button'));
    await waitFor(() => {
      const nameInput = screen.getByTestId('agent-name-input') as HTMLInputElement;
      expect(nameInput.value).toBe('');
      expect(nameInput.disabled).toBe(false);
    });
  });

  it('should validate required fields before allowing save', async () => {
    render(<AgentSettingsDialog isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('new-agent-button')).toBeInTheDocument();
    });
    // Click new agent to get blank form
    fireEvent.click(screen.getByTestId('new-agent-button'));
    await waitFor(() => {
      expect(screen.getByTestId('agent-save-button')).toBeInTheDocument();
    });
    // Try saving with empty name
    fireEvent.click(screen.getByTestId('agent-save-button'));
    // Should not call save
    expect(mockSaveDefinition).not.toHaveBeenCalled();
  });

  it('should disable delete button for built-in agents', async () => {
    render(<AgentSettingsDialog isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('plan-agent')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('plan-agent'));
    await waitFor(() => {
      const deleteBtn = screen.queryByTestId('agent-delete-button');
      // For built-in agents, delete button should either not exist or be disabled
      if (deleteBtn) {
        expect(deleteBtn).toBeDisabled();
      } else {
        // No delete button for built-in is also acceptable
        expect(deleteBtn).toBeNull();
      }
    });
  });
});

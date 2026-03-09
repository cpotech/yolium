/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddSpecialistDialog } from '@renderer/components/schedule/AddSpecialistDialog';

const mockScaffold = vi.fn();
const mockSaveCredentials = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockScaffold.mockResolvedValue({ filePath: '/tmp/agents/cron/code-quality.md' });
  mockSaveCredentials.mockResolvedValue(undefined);

  Object.defineProperty(window, 'electronAPI', {
    value: {
      schedule: {
        scaffold: mockScaffold,
        saveCredentials: mockSaveCredentials,
      },
    },
    writable: true,
  });
});

describe('AddSpecialistDialog', () => {
  it('should render name field and markdown editor textarea', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByTestId('specialist-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('specialist-markdown-editor')).toBeInTheDocument();
  });

  it('should render service credentials section with add service button', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByTestId('specialist-add-service-btn')).toBeInTheDocument();
  });

  it('should allow adding a service with credential key-value pairs', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByTestId('specialist-add-service-btn'));

    // Should now have a service name input and credential key/value
    expect(screen.getByTestId('specialist-service-name-0')).toBeInTheDocument();
    expect(screen.getByTestId('specialist-credential-key-0-0')).toBeInTheDocument();
    expect(screen.getByTestId('specialist-credential-value-0-0')).toBeInTheDocument();
  });

  it('should allow removing a credential key-value pair', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByTestId('specialist-add-service-btn'));

    // Verify credential row exists
    expect(screen.getByTestId('specialist-credential-key-0-0')).toBeInTheDocument();

    // Click remove credential button
    fireEvent.click(screen.getByTestId('specialist-remove-credential-0-0'));

    // Credential row should be gone
    expect(screen.queryByTestId('specialist-credential-key-0-0')).not.toBeInTheDocument();
  });

  it('should allow adding and removing multiple services', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    // Add two services
    fireEvent.click(screen.getByTestId('specialist-add-service-btn'));
    fireEvent.click(screen.getByTestId('specialist-add-service-btn'));

    expect(screen.getByTestId('specialist-service-name-0')).toBeInTheDocument();
    expect(screen.getByTestId('specialist-service-name-1')).toBeInTheDocument();

    // Remove first service
    fireEvent.click(screen.getByTestId('specialist-remove-service-0'));

    // The second service should still exist (now at index 0 after re-render)
    expect(screen.getByTestId('specialist-service-name-0')).toBeInTheDocument();
    // Only one service remains
    expect(screen.queryByTestId('specialist-service-name-1')).not.toBeInTheDocument();
  });

  it('should call schedule:save-credentials after successful scaffold', async () => {
    const onCreated = vi.fn();

    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={onCreated} />);

    // Enter name
    fireEvent.change(screen.getByTestId('specialist-name-input'), {
      target: { value: 'test-specialist' },
    });

    // Add a service with credentials
    fireEvent.click(screen.getByTestId('specialist-add-service-btn'));
    fireEvent.change(screen.getByTestId('specialist-service-name-0'), {
      target: { value: 'twitter-api' },
    });
    fireEvent.change(screen.getByTestId('specialist-credential-key-0-0'), {
      target: { value: 'API_KEY' },
    });
    fireEvent.change(screen.getByTestId('specialist-credential-value-0-0'), {
      target: { value: 'my-secret-key' },
    });

    fireEvent.click(screen.getByTestId('specialist-create-btn'));

    await waitFor(() => {
      expect(mockScaffold).toHaveBeenCalledWith('test-specialist', undefined);
      expect(mockSaveCredentials).toHaveBeenCalledWith(
        'test-specialist',
        'twitter-api',
        { API_KEY: 'my-secret-key' }
      );
      expect(onCreated).toHaveBeenCalledTimes(1);
    });
  });

  it('should use password input type for credential value fields', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByTestId('specialist-add-service-btn'));

    const valueInput = screen.getByTestId('specialist-credential-value-0-0');
    expect(valueInput).toHaveAttribute('type', 'password');
  });

  it('should pass markdown content to scaffold when editor has content', async () => {
    const onCreated = vi.fn();

    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={onCreated} />);

    fireEvent.change(screen.getByTestId('specialist-name-input'), {
      target: { value: 'custom-agent' },
    });

    const markdownContent = `---
name: custom-agent
description: A custom agent
model: sonnet
tools:
  - Read
schedules:
  - type: daily
    cron: "0 0 * * *"
    enabled: true
---

# Custom Agent`;

    fireEvent.change(screen.getByTestId('specialist-markdown-editor'), {
      target: { value: markdownContent },
    });

    fireEvent.click(screen.getByTestId('specialist-create-btn'));

    await waitFor(() => {
      expect(mockScaffold).toHaveBeenCalledWith('custom-agent', { content: markdownContent });
    });
  });

  it('should use template scaffold when markdown editor is empty', async () => {
    const onCreated = vi.fn();

    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={onCreated} />);

    fireEvent.change(screen.getByTestId('specialist-name-input'), {
      target: { value: 'simple-agent' },
    });

    fireEvent.click(screen.getByTestId('specialist-create-btn'));

    await waitFor(() => {
      expect(mockScaffold).toHaveBeenCalledWith('simple-agent', undefined);
    });
  });

  it('should show validation error when markdown content is invalid', async () => {
    mockScaffold.mockRejectedValueOnce(new Error('Specialist definition missing required fields'));

    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByTestId('specialist-name-input'), {
      target: { value: 'bad-agent' },
    });

    fireEvent.change(screen.getByTestId('specialist-markdown-editor'), {
      target: { value: 'invalid markdown' },
    });

    fireEvent.click(screen.getByTestId('specialist-create-btn'));

    await waitFor(() => {
      expect(screen.getByText('Specialist definition missing required fields')).toBeInTheDocument();
    });
  });

  it('should auto-populate credential fields from parsed frontmatter integrations', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    const markdownWithIntegrations = `---
name: test
description: Test
model: haiku
tools:
  - Read
schedules:
  - type: daily
    cron: "0 0 * * *"
    enabled: true
integrations:
  - service: twitter-api
    env:
      API_KEY: ""
      API_SECRET: ""
---

# Test`;

    fireEvent.change(screen.getByTestId('specialist-markdown-editor'), {
      target: { value: markdownWithIntegrations },
    });

    // Should auto-populate service credentials from integrations
    expect(screen.getByTestId('specialist-service-name-0')).toHaveValue('twitter-api');
    expect(screen.getByTestId('specialist-credential-key-0-0')).toHaveValue('API_KEY');
    expect(screen.getByTestId('specialist-credential-key-0-1')).toHaveValue('API_SECRET');
  });

  it('should disable Create button when name is empty', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByTestId('specialist-create-btn')).toBeDisabled();
  });

  it('should sanitize name input to kebab-case on blur', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    const nameInput = screen.getByTestId('specialist-name-input');
    fireEvent.change(nameInput, {
      target: { value: '  My_Specialist!! 2026  ' },
    });
    fireEvent.blur(nameInput);

    expect(nameInput).toHaveValue('my-specialist-2026');
  });

  it('should close on Escape and backdrop click', () => {
    const onClose = vi.fn();

    render(<AddSpecialistDialog isOpen={true} onClose={onClose} onCreated={vi.fn()} />);

    fireEvent.keyDown(screen.getByTestId('add-specialist-dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    fireEvent.click(screen.getByTestId('add-specialist-dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

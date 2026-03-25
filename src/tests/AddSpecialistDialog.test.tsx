/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AddSpecialistDialog,
  sanitizeSpecialistName,
  serializeGuidedFormToMarkdown,
  parseMarkdownToGuidedForm,
} from '@renderer/components/schedule/AddSpecialistDialog';
import { describeCron, CRON_PRESETS } from '@renderer/components/schedule/CronHelper';

const mockScaffold = vi.fn();
const mockUpdateDefinition = vi.fn();
const mockSaveCredentials = vi.fn();
const mockGetTemplate = vi.fn();
const mockGetSpecialists = vi.fn();
const mockGetRawDefinition = vi.fn();
const mockGetCredentials = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockScaffold.mockResolvedValue({ filePath: '/tmp/agents/cron/code-quality.md' });
  mockUpdateDefinition.mockResolvedValue({ filePath: '/tmp/agents/cron/security-monitor.md' });
  mockSaveCredentials.mockResolvedValue(undefined);
  mockGetTemplate.mockResolvedValue('---\nname: code-quality\ndescription: code-quality monitoring and analysis\nmodel: haiku\n---\n\n# Code Quality Specialist\n');
  mockGetCredentials.mockResolvedValue({});
  mockGetSpecialists.mockResolvedValue({
    'security-monitor': { name: 'security-monitor', description: 'Security scanning', model: 'haiku', schedules: [] },
    'code-quality': { name: 'code-quality', description: 'Code quality checks', model: 'sonnet', schedules: [] },
  });
  mockGetRawDefinition.mockResolvedValue(`---
name: security-monitor
description: Security scanning
model: haiku
tools:
  - Read
schedules:
  - type: daily
    cron: "0 0 * * *"
    enabled: true
memory:
  strategy: distill_daily
  maxEntries: 300
  retentionDays: 90
escalation:
  onFailure: alert_user
integrations:
  - service: slack
    env:
      SLACK_WEBHOOK: ""
      SLACK_CHANNEL: ""
---

# Security Monitor`);

  Object.defineProperty(window, 'electronAPI', {
    value: {
      schedule: {
        scaffold: mockScaffold,
        updateDefinition: mockUpdateDefinition,
        saveCredentials: mockSaveCredentials,
        getTemplate: mockGetTemplate,
        getSpecialists: mockGetSpecialists,
        getRawDefinition: mockGetRawDefinition,
        getCredentials: mockGetCredentials,
      },
    },
    writable: true,
  });
});

describe('AddSpecialistDialog', () => {
  it('should render name field and guided form (no paste mode toggle)', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByTestId('specialist-name-input')).toBeInTheDocument();
    expect(screen.getByText(/~\/\.yolium\/agents\/cron\/custom\//)).toBeInTheDocument();
    // Guided form sections should be visible
    expect(screen.getByTestId('guided-description')).toBeInTheDocument();
    // No paste mode toggle should exist
    expect(screen.queryByTestId('specialist-mode-paste')).not.toBeInTheDocument();
    expect(screen.queryByTestId('specialist-mode-guided')).not.toBeInTheDocument();
    // No markdown editor textarea
    expect(screen.queryByTestId('specialist-markdown-editor')).not.toBeInTheDocument();
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
      expect(mockScaffold).toHaveBeenCalled();
      expect(mockSaveCredentials).toHaveBeenCalledWith(
        'test-specialist',
        'twitter-api',
        { API_KEY: 'my-secret-key' }
      );
      expect(onCreated).toHaveBeenCalledTimes(1);
    });
  });

  it('should render service credential value inputs as type text', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(screen.getByTestId('specialist-add-service-btn'));

    const valueInput = screen.getByTestId('specialist-credential-value-0-0');
    expect(valueInput).toHaveAttribute('type', 'text');
  });

  it('should render integration env value inputs as type text', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    // Expand the Integrations section (collapsed by default)
    fireEvent.click(screen.getByTestId('section-integrations-toggle'));

    // Add an integration, then add an env key to it
    fireEvent.click(screen.getByText('+ Add service'));
    fireEvent.click(screen.getByText('+ Add env key'));

    // Integration env value inputs should be plain text
    const envInputs = screen.getAllByPlaceholderText('Value');
    envInputs.forEach((input) => {
      expect(input).toHaveAttribute('type', 'text');
    });
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

  it('should close on Ctrl+Q and backdrop click', () => {
    const onClose = vi.fn();

    render(<AddSpecialistDialog isOpen={true} onClose={onClose} onCreated={vi.fn()} />);

    fireEvent.keyDown(screen.getByTestId('add-specialist-dialog'), { key: 'q', ctrlKey: true });
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    fireEvent.click(screen.getByTestId('add-specialist-dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should serialize guided form and pass to scaffold on create', async () => {
    const onCreated = vi.fn();

    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={onCreated} />);

    // Enter name
    fireEvent.change(screen.getByTestId('specialist-name-input'), {
      target: { value: 'my-agent' },
    });

    // Fill in guided form fields
    fireEvent.change(screen.getByTestId('guided-description'), {
      target: { value: 'A great agent' },
    });

    fireEvent.click(screen.getByTestId('specialist-create-btn'));

    await waitFor(() => {
      expect(mockScaffold).toHaveBeenCalled();
      const call = mockScaffold.mock.calls[0];
      expect(call[0]).toBe('my-agent');
      // Should pass serialized content from guided form
      expect(call[1]).toBeDefined();
      expect(call[1].content).toContain('name: my-agent');
      expect(call[1].content).toContain('description: A great agent');
    });
  });

  it('should use default guided form state when no content provided', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    // The guided form should have default state visible
    const descInput = screen.getByTestId('guided-description') as HTMLInputElement;
    expect(descInput.value).toBe('');

    const modelSelect = screen.getByTestId('guided-model') as HTMLSelectElement;
    expect(modelSelect.value).toBe('haiku');
  });

  it('should preload guided form state and service rows when opened in edit mode', async () => {
    render(
      <AddSpecialistDialog
        isOpen={true}
        editingSpecialistId="security-monitor"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockGetRawDefinition).toHaveBeenCalledWith('security-monitor');
    });

    // Name should be set
    expect(screen.getByTestId('specialist-name-input')).toHaveValue('security-monitor');

    // Guided form should be populated
    await waitFor(() => {
      expect((screen.getByTestId('guided-description') as HTMLInputElement).value).toBe('Security scanning');
    });

    // Service credential rows derived from integrations
    expect(screen.getByTestId('specialist-service-name-0')).toHaveValue('slack');
    expect(screen.getByTestId('specialist-credential-key-0-0')).toHaveValue('SLACK_WEBHOOK');
    expect(screen.getByTestId('specialist-credential-key-0-1')).toHaveValue('SLACK_CHANNEL');
  });

  it('should lock the specialist name and hide clone dropdown in edit mode', async () => {
    render(
      <AddSpecialistDialog
        isOpen={true}
        editingSpecialistId="security-monitor"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockGetRawDefinition).toHaveBeenCalledWith('security-monitor');
    });

    expect(screen.getByTestId('specialist-name-input')).toBeDisabled();
    expect(screen.queryByTestId('specialist-clone-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('specialist-create-btn')).toHaveTextContent('Save');
    expect(screen.getByText(/Default agents stay in/)).toBeInTheDocument();
  });

  it('should call schedule.updateDefinition with serialized guided form when saving in edit mode', async () => {
    const onCreated = vi.fn();

    render(
      <AddSpecialistDialog
        isOpen={true}
        editingSpecialistId="security-monitor"
        onClose={vi.fn()}
        onCreated={onCreated}
      />
    );

    await waitFor(() => {
      expect(mockGetRawDefinition).toHaveBeenCalledWith('security-monitor');
    });

    // Wait for guided form to be populated
    await waitFor(() => {
      expect((screen.getByTestId('guided-description') as HTMLInputElement).value).toBe('Security scanning');
    });

    // Modify a field in the guided form
    fireEvent.change(screen.getByTestId('guided-description'), {
      target: { value: 'Updated security scanning' },
    });

    fireEvent.click(screen.getByTestId('specialist-create-btn'));

    await waitFor(() => {
      expect(mockUpdateDefinition).toHaveBeenCalled();
      const content = mockUpdateDefinition.mock.calls[0][1];
      expect(content).toContain('name: security-monitor');
      expect(content).toContain('description: Updated security scanning');
    });

    expect(mockScaffold).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('should continue to use schedule.scaffold when no editing specialist id is provided', async () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByTestId('specialist-name-input'), {
      target: { value: 'create-me' },
    });
    fireEvent.click(screen.getByTestId('specialist-create-btn'));

    await waitFor(() => {
      expect(mockScaffold).toHaveBeenCalled();
      expect(mockScaffold.mock.calls[0][0]).toBe('create-me');
    });

    expect(mockUpdateDefinition).not.toHaveBeenCalled();
  });

  it('should populate guided form from cloned specialist definition', async () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    // Wait for specialists to load
    await waitFor(() => {
      expect(mockGetSpecialists).toHaveBeenCalled();
    });

    // Clone from security-monitor
    const cloneSelect = screen.getByTestId('specialist-clone-select');
    await act(async () => {
      fireEvent.change(cloneSelect, { target: { value: 'security-monitor' } });
    });

    await waitFor(() => {
      expect(mockGetRawDefinition).toHaveBeenCalledWith('security-monitor');
    });

    // Guided form should be populated from the cloned definition
    await waitFor(() => {
      expect((screen.getByTestId('guided-description') as HTMLInputElement).value).toBe('Security scanning');
    });

    // Name should be cleared for user to provide a new one
    expect(screen.getByTestId('specialist-name-input')).toHaveValue('');
  });
});

describe('sanitizeSpecialistName', () => {
  it('should convert spaces and underscores to kebab-case', () => {
    expect(sanitizeSpecialistName('My Specialist Name')).toBe('my-specialist-name');
    expect(sanitizeSpecialistName('my_specialist_name')).toBe('my-specialist-name');
    expect(sanitizeSpecialistName('Mixed Spaces_And_Underscores')).toBe('mixed-spaces-and-underscores');
  });

  it('should strip invalid characters', () => {
    expect(sanitizeSpecialistName('hello!!world@#$%')).toBe('helloworld');
    expect(sanitizeSpecialistName('  --leading-trailing--  ')).toBe('leading-trailing');
    expect(sanitizeSpecialistName('UPPERCASE')).toBe('uppercase');
  });
});

describe('guided mode serialization', () => {
  it('should serialize form state to valid YAML markdown', () => {
    const result = serializeGuidedFormToMarkdown({
      name: 'test-agent',
      description: 'A test agent',
      model: 'haiku',
      tools: ['Read', 'Grep', 'Bash'],
      schedules: [{ type: 'daily', cron: '0 0 * * *', enabled: true }],
      memory: { strategy: 'distill_daily', maxEntries: 300, retentionDays: 90 },
      escalation: { onFailure: 'alert_user', onPattern: 'reduce_frequency' },
      promptTemplates: { daily: 'Review the day.' },
      integrations: [{ service: 'twitter', env: { API_KEY: '' } }],
      systemPrompt: '# Test Agent\n\nYou are a test agent.',
    });

    expect(result).toContain('name: test-agent');
    expect(result).toContain('description: A test agent');
    expect(result).toContain('model: haiku');
    expect(result).toContain('Read');
    expect(result).toContain('0 0 * * *');
    expect(result).toContain('# Test Agent');
  });

  it('should parse markdown into form state', () => {
    const markdown = `---
name: test-agent
description: A test agent
model: sonnet
tools:
  - Read
  - Bash
schedules:
  - type: daily
    cron: "0 0 * * *"
    enabled: true
memory:
  strategy: distill_daily
  maxEntries: 300
  retentionDays: 90
escalation:
  onFailure: alert_user
  onPattern: reduce_frequency
promptTemplates:
  daily: Review the day.
integrations:
  - service: twitter
    env:
      API_KEY: ""
---

# Test Agent

You are a test agent.`;

    const result = parseMarkdownToGuidedForm(markdown);
    expect(result.name).toBe('test-agent');
    expect(result.description).toBe('A test agent');
    expect(result.model).toBe('sonnet');
    expect(result.tools).toContain('Read');
    expect(result.tools).toContain('Bash');
    expect(result.schedules).toHaveLength(1);
    expect(result.schedules[0].cron).toBe('0 0 * * *');
    expect(result.memory.strategy).toBe('distill_daily');
    expect(result.escalation.onFailure).toBe('alert_user');
    expect(result.systemPrompt).toContain('# Test Agent');
  });
});

describe('cron helper', () => {
  it('should display human-readable description for common expressions', () => {
    expect(describeCron('*/30 * * * *')).toBe('Every 30 minutes');
    expect(describeCron('0 0 * * *')).toBe('Daily at midnight');
    expect(describeCron('0 9 * * 1')).toBe('Weekly on Monday at 9:00 AM');
    expect(describeCron('*/15 * * * *')).toBe('Every 15 minutes');
    expect(describeCron('0 8 * * *')).toBe('Daily at 8:00 AM');
  });

  it('should provide correct preset cron expressions', () => {
    expect(CRON_PRESETS).toBeDefined();
    expect(Array.isArray(CRON_PRESETS)).toBe(true);
    const labels = CRON_PRESETS.map(p => p.label);
    expect(labels).toContain('Every 15 min');
    expect(labels).toContain('Every 30 min');
    expect(labels).toContain('Hourly');
    expect(labels).toContain('Daily at midnight');
  });
});

describe('clone from existing', () => {
  it('clone dropdown should populate with existing specialist names', async () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    // Wait for specialists to load
    await waitFor(() => {
      expect(mockGetSpecialists).toHaveBeenCalled();
    });

    // Clone dropdown should be present
    const cloneSelect = screen.getByTestId('specialist-clone-select');
    expect(cloneSelect).toBeInTheDocument();
  });
});

/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AddSpecialistDialog,
  sanitizeSpecialistName,
  tryParseIntegrations,
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

  it('should populate markdown editor with default template after entering a name and blurring', async () => {
    const templateContent = '---\nname: code-quality\nmodel: haiku\n---\n\n# Code Quality Specialist\n';
    mockGetTemplate.mockResolvedValue(templateContent);

    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    const nameInput = screen.getByTestId('specialist-name-input');

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'code-quality' } });
    });

    await act(async () => {
      fireEvent.blur(nameInput);
    });

    // Allow effects + microtasks to flush
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetTemplate).toHaveBeenCalledWith('code-quality');
    const editor = screen.getByTestId('specialist-markdown-editor') as HTMLTextAreaElement;
    expect(editor.value).toContain('code-quality');
  });

  it('should allow editing the pre-populated template content', async () => {
    const templateContent = '---\nname: code-quality\nmodel: haiku\n---\n\n# Code Quality Specialist\n';
    mockGetTemplate.mockResolvedValue(templateContent);

    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    const nameInput = screen.getByTestId('specialist-name-input');
    await act(async () => { fireEvent.change(nameInput, { target: { value: 'code-quality' } }); });
    await act(async () => { fireEvent.blur(nameInput); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    const editor = screen.getByTestId('specialist-markdown-editor') as HTMLTextAreaElement;
    expect(editor.value).toContain('code-quality');

    // User edits the content
    fireEvent.change(screen.getByTestId('specialist-markdown-editor'), {
      target: { value: 'user edited content' },
    });

    expect(screen.getByTestId('specialist-markdown-editor')).toHaveValue('user edited content');
  });

  it('should not overwrite user-edited markdown when name changes', async () => {
    const templateContent = '---\nname: some-name\nmodel: haiku\n---\n';
    mockGetTemplate.mockResolvedValue(templateContent);

    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    // User types in the textarea first
    fireEvent.change(screen.getByTestId('specialist-markdown-editor'), {
      target: { value: 'my custom definition' },
    });

    // Then enters and blurs name
    const nameInput = screen.getByTestId('specialist-name-input');
    await act(async () => { fireEvent.change(nameInput, { target: { value: 'some-name' } }); });
    await act(async () => { fireEvent.blur(nameInput); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByTestId('specialist-markdown-editor')).toHaveValue('my custom definition');
    // getTemplate should not have been called since user already edited
    expect(mockGetTemplate).not.toHaveBeenCalled();
  });

  it('should send edited template content to scaffold on create', async () => {
    const templateContent = '---\nname: code-quality\nmodel: haiku\n---\n\n# Code Quality Specialist\n';
    mockGetTemplate.mockResolvedValue(templateContent);

    const onCreated = vi.fn();
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={onCreated} />);

    // Enter name and blur to trigger template population
    const nameInput = screen.getByTestId('specialist-name-input');
    await act(async () => { fireEvent.change(nameInput, { target: { value: 'code-quality' } }); });
    await act(async () => { fireEvent.blur(nameInput); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    const editor = screen.getByTestId('specialist-markdown-editor') as HTMLTextAreaElement;
    expect(editor.value).toContain('code-quality');

    // User edits the pre-populated content
    const editedContent = '---\nname: code-quality\ndescription: edited\nmodel: sonnet\n---\n\n# Edited';
    fireEvent.change(screen.getByTestId('specialist-markdown-editor'), {
      target: { value: editedContent },
    });

    fireEvent.click(screen.getByTestId('specialist-create-btn'));

    await waitFor(() => {
      expect(mockScaffold).toHaveBeenCalledWith('code-quality', { content: editedContent });
    });
  });

  it('should preload the current markdown definition and integration-derived service rows when opened in edit mode', async () => {
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

    expect(screen.getByTestId('specialist-name-input')).toHaveValue('security-monitor');
    expect((screen.getByTestId('specialist-markdown-editor') as HTMLTextAreaElement).value).toContain(
      'description: Security scanning'
    );
    expect(screen.getByTestId('specialist-service-name-0')).toHaveValue('slack');
    expect(screen.getByTestId('specialist-credential-key-0-0')).toHaveValue('SLACK_WEBHOOK');
    expect(screen.getByTestId('specialist-credential-key-0-1')).toHaveValue('SLACK_CHANNEL');
  });

  it('should lock the specialist name and hide create-only clone/template affordances in edit mode', async () => {
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
    expect(screen.queryByText(/auto-populate with the default template/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('specialist-create-btn')).toHaveTextContent('Save');
  });

  it('should call schedule.updateDefinition instead of schedule.scaffold when saving an edited specialist', async () => {
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

    fireEvent.change(screen.getByTestId('specialist-markdown-editor'), {
      target: { value: '---\nname: security-monitor\ndescription: Updated\nmodel: haiku\nschedules:\n  - type: daily\n    cron: "0 0 * * *"\n    enabled: true\ntools:\n  - Read\n---\n\n# Updated' },
    });
    fireEvent.click(screen.getByTestId('specialist-create-btn'));

    await waitFor(() => {
      expect(mockUpdateDefinition).toHaveBeenCalledWith(
        'security-monitor',
        '---\nname: security-monitor\ndescription: Updated\nmodel: haiku\nschedules:\n  - type: daily\n    cron: "0 0 * * *"\n    enabled: true\ntools:\n  - Read\n---\n\n# Updated'
      );
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
      expect(mockScaffold).toHaveBeenCalledWith('create-me', undefined);
    });

    expect(mockUpdateDefinition).not.toHaveBeenCalled();
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

describe('tryParseIntegrations', () => {
  it('should extract services from valid YAML frontmatter', () => {
    const markdown = `---
name: test
integrations:
  - service: twitter-api
    env:
      API_KEY: ""
      API_SECRET: ""
  - service: slack
    env:
      WEBHOOK_URL: ""
---

# Content`;

    const result = tryParseIntegrations(markdown);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('twitter-api');
    expect(result[0].credentials).toHaveLength(2);
    expect(result[0].credentials[0].key).toBe('API_KEY');
    expect(result[1].name).toBe('slack');
  });

  it('should return empty array for invalid frontmatter', () => {
    expect(tryParseIntegrations('no frontmatter here')).toEqual([]);
    expect(tryParseIntegrations('---\nname: test\n---\nno integrations')).toEqual([]);
  });

  it('should preserve existing credential values when re-parsing', () => {
    const markdown = `---
name: test
integrations:
  - service: twitter-api
    env:
      API_KEY: ""
---

# Content`;

    const result = tryParseIntegrations(markdown);
    expect(result[0].credentials[0].value).toBe('');
  });
});

describe('auto-detect name from pasted YAML', () => {
  it('should extract name from pasted YAML frontmatter and auto-fill name input', () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    const markdown = `---
name: my-cool-agent
description: Does cool things
model: sonnet
---

# My Cool Agent`;

    fireEvent.change(screen.getByTestId('specialist-markdown-editor'), {
      target: { value: markdown },
    });

    // Name input should be auto-filled from YAML frontmatter
    expect(screen.getByTestId('specialist-name-input')).toHaveValue('my-cool-agent');
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

  it('should parse markdown into form state for mode switching', () => {
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

describe('validation', () => {
  it('should show error for missing required fields in real-time', async () => {
    render(<AddSpecialistDialog isOpen={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    // Type invalid YAML into editor
    const invalidMarkdown = `---
name: test
---

# Test`;

    fireEvent.change(screen.getByTestId('specialist-markdown-editor'), {
      target: { value: invalidMarkdown },
    });

    // Validation badge should appear after debounce
    await waitFor(() => {
      const badge = screen.queryByTestId('specialist-validation-badge');
      expect(badge).toBeInTheDocument();
    }, { timeout: 1000 });
  });
});

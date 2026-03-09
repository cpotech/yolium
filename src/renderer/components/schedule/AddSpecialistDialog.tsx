import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CronHelper } from './CronHelper';
import type { MemoryStrategy, EscalationAction } from '@shared/types/schedule';

interface AddSpecialistDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface CredentialRow {
  key: string;
  value: string;
}

interface ServiceBlock {
  name: string;
  credentials: CredentialRow[];
}

interface GuidedFormState {
  name: string;
  description: string;
  model: string;
  tools: string[];
  schedules: Array<{ type: string; cron: string; enabled: boolean }>;
  memory: { strategy: MemoryStrategy; maxEntries: number; retentionDays: number };
  escalation: { onFailure?: EscalationAction; onPattern?: EscalationAction };
  promptTemplates: Record<string, string>;
  integrations: Array<{ service: string; env: Record<string, string> }>;
  systemPrompt: string;
}

type DialogMode = 'paste' | 'guided';

const AVAILABLE_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];
const MODELS = ['haiku', 'sonnet', 'opus'];
const MEMORY_STRATEGIES: MemoryStrategy[] = ['distill_daily', 'distill_weekly', 'raw'];
const ESCALATION_ACTIONS: EscalationAction[] = ['alert_user', 'reduce_frequency', 'pause', 'notify_slack'];

export function sanitizeSpecialistName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function tryParseIntegrations(markdown: string): ServiceBlock[] {
  try {
    const match = markdown.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return [];

    const frontmatter = match[1];
    const integrationsMatch = frontmatter.match(/integrations:\s*\n((?:\s+-[\s\S]*?)(?=\n\w|\n---|$))/);
    if (!integrationsMatch) return [];

    const services: ServiceBlock[] = [];
    const lines = integrationsMatch[1].split('\n');
    let currentService: ServiceBlock | null = null;
    let inEnv = false;

    for (const line of lines) {
      const serviceMatch = line.match(/^\s+-\s+service:\s*(.+)/);
      if (serviceMatch) {
        if (currentService) services.push(currentService);
        currentService = { name: serviceMatch[1].trim(), credentials: [] };
        inEnv = false;
        continue;
      }

      if (line.match(/^\s+env:\s*$/)) {
        inEnv = true;
        continue;
      }

      if (inEnv && currentService) {
        const envMatch = line.match(/^\s+(\w+):\s*(.*)/);
        if (envMatch) {
          currentService.credentials.push({ key: envMatch[1], value: '' });
        }
      }
    }
    if (currentService) services.push(currentService);
    return services;
  } catch {
    return [];
  }
}

function extractNameFromMarkdown(markdown: string): string | null {
  const match = markdown.match(/^---\n[\s\S]*?name:\s*(.+)/m);
  return match ? match[1].trim() : null;
}

function validateFrontmatter(markdown: string): { valid: boolean; error?: string } {
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return { valid: false, error: 'Missing frontmatter (---...---)' };

  const fm = fmMatch[1];
  if (!fm.match(/name:\s*.+/)) return { valid: false, error: 'Missing required field: name' };
  if (!fm.match(/description:\s*.+/)) return { valid: false, error: 'Missing required field: description' };
  if (!fm.match(/model:\s*.+/)) return { valid: false, error: 'Missing required field: model' };
  if (!fm.match(/tools:/)) return { valid: false, error: 'Missing required field: tools' };
  if (!fm.match(/schedules:/)) return { valid: false, error: 'Missing required field: schedules' };

  return { valid: true };
}

const DEFAULT_GUIDED_STATE: GuidedFormState = {
  name: '',
  description: '',
  model: 'haiku',
  tools: ['Read', 'Glob', 'Grep', 'Bash'],
  schedules: [{ type: 'daily', cron: '0 0 * * *', enabled: true }],
  memory: { strategy: 'distill_daily', maxEntries: 300, retentionDays: 90 },
  escalation: { onFailure: 'alert_user', onPattern: 'reduce_frequency' },
  promptTemplates: {},
  integrations: [],
  systemPrompt: '',
};

export function serializeGuidedFormToMarkdown(form: GuidedFormState): string {
  const lines: string[] = ['---'];
  lines.push(`name: ${form.name}`);
  lines.push(`description: ${form.description}`);
  lines.push(`model: ${form.model}`);
  lines.push('tools:');
  for (const tool of form.tools) {
    lines.push(`  - ${tool}`);
  }
  lines.push('schedules:');
  for (const s of form.schedules) {
    lines.push(`  - type: ${s.type}`);
    lines.push(`    cron: "${s.cron}"`);
    lines.push(`    enabled: ${s.enabled}`);
  }
  lines.push('memory:');
  lines.push(`  strategy: ${form.memory.strategy}`);
  lines.push(`  maxEntries: ${form.memory.maxEntries}`);
  lines.push(`  retentionDays: ${form.memory.retentionDays}`);
  lines.push('escalation:');
  if (form.escalation.onFailure) lines.push(`  onFailure: ${form.escalation.onFailure}`);
  if (form.escalation.onPattern) lines.push(`  onPattern: ${form.escalation.onPattern}`);
  if (Object.keys(form.promptTemplates).length > 0) {
    lines.push('promptTemplates:');
    for (const [key, value] of Object.entries(form.promptTemplates)) {
      lines.push(`  ${key}: |`);
      for (const line of value.split('\n')) {
        lines.push(`    ${line}`);
      }
    }
  }
  if (form.integrations.length > 0) {
    lines.push('integrations:');
    for (const int of form.integrations) {
      lines.push(`  - service: ${int.service}`);
      lines.push('    env:');
      for (const [key, val] of Object.entries(int.env)) {
        lines.push(`      ${key}: "${val}"`);
      }
    }
  }
  lines.push('---');
  lines.push('');
  lines.push(form.systemPrompt || `# ${form.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Specialist\n\nYou are a specialist agent.`);

  return lines.join('\n');
}

// Uses regex-based YAML parsing instead of gray-matter because this runs in the
// renderer process where Node.js modules (fs, path) required by gray-matter are unavailable.
export function parseMarkdownToGuidedForm(markdown: string): GuidedFormState {
  const form: GuidedFormState = { ...DEFAULT_GUIDED_STATE, tools: [...DEFAULT_GUIDED_STATE.tools], schedules: [], integrations: [] };

  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return form;

  const body = markdown.slice(fmMatch[0].length).trim();
  form.systemPrompt = body;

  // Simple YAML parsing using regex (sufficient for our structured frontmatter)
  const fm = fmMatch[1];

  const nameMatch = fm.match(/name:\s*(.+)/);
  if (nameMatch) form.name = nameMatch[1].trim();

  const descMatch = fm.match(/description:\s*(.+)/);
  if (descMatch) form.description = descMatch[1].trim();

  const modelMatch = fm.match(/model:\s*(.+)/);
  if (modelMatch) form.model = modelMatch[1].trim();

  // Parse tools
  const toolsMatch = fm.match(/tools:\s*\n((?:\s+-\s+.+\n?)*)/);
  if (toolsMatch) {
    form.tools = toolsMatch[1].match(/-\s+(.+)/g)?.map(t => t.replace(/-\s+/, '').trim()) || [];
  }

  // Parse schedules
  const schedulesMatch = fm.match(/schedules:\s*\n((?:\s+-[\s\S]*?)(?=\n\w|\n---|$))/);
  if (schedulesMatch) {
    const schedBlock = schedulesMatch[1];
    const schedEntries = schedBlock.split(/\n\s+-\s+/).filter(Boolean);
    for (const entry of schedEntries) {
      const clean = entry.startsWith('-') ? entry.replace(/^-\s+/, '') : entry;
      const typeMatch = clean.match(/type:\s*(.+)/);
      const cronMatch = clean.match(/cron:\s*"?([^"\n]+)"?/);
      const enabledMatch = clean.match(/enabled:\s*(true|false)/);
      if (typeMatch && cronMatch) {
        form.schedules.push({
          type: typeMatch[1].trim(),
          cron: cronMatch[1].trim(),
          enabled: enabledMatch ? enabledMatch[1] === 'true' : true,
        });
      }
    }
  }

  // Parse memory
  const strategyMatch = fm.match(/strategy:\s*(.+)/);
  if (strategyMatch) form.memory.strategy = strategyMatch[1].trim() as MemoryStrategy;
  const maxEntriesMatch = fm.match(/maxEntries:\s*(\d+)/);
  if (maxEntriesMatch) form.memory.maxEntries = parseInt(maxEntriesMatch[1], 10);
  const retentionMatch = fm.match(/retentionDays:\s*(\d+)/);
  if (retentionMatch) form.memory.retentionDays = parseInt(retentionMatch[1], 10);

  // Parse escalation
  const onFailMatch = fm.match(/onFailure:\s*(.+)/);
  if (onFailMatch) form.escalation.onFailure = onFailMatch[1].trim() as EscalationAction;
  const onPatMatch = fm.match(/onPattern:\s*(.+)/);
  if (onPatMatch) form.escalation.onPattern = onPatMatch[1].trim() as EscalationAction;

  // Parse promptTemplates
  const ptMatch = fm.match(/promptTemplates:\s*\n((?:\s+\w+:[\s\S]*?)(?=\n\w|\n---|$))/);
  if (ptMatch) {
    const ptBlock = ptMatch[1];
    const ptEntries = ptBlock.match(/\s+(\w+):\s*\|?\s*\n?((?:\s{4,}.+\n?)*)/g);
    if (ptEntries) {
      for (const entry of ptEntries) {
        const keyMatch = entry.match(/(\w+):\s*/);
        if (keyMatch) {
          const key = keyMatch[1];
          const valueLines = entry.split('\n').slice(1).map(l => l.replace(/^\s{4}/, '')).join('\n').trim();
          form.promptTemplates[key] = valueLines || entry.split(/:\s*\|?\s*/)[1]?.trim() || '';
        }
      }
    }
  }

  // Parse integrations
  const intMatch = fm.match(/integrations:\s*\n((?:\s+-[\s\S]*?)(?=\n\w|\n---|$))/);
  if (intMatch) {
    const intBlock = intMatch[1];
    const entries = intBlock.split(/\n\s+-\s+/).filter(Boolean);
    for (const entry of entries) {
      const clean = entry.startsWith('-') ? entry.replace(/^-\s+/, '') : entry;
      const svcMatch = clean.match(/service:\s*(.+)/);
      if (svcMatch) {
        const env: Record<string, string> = {};
        const envSection = clean.match(/env:\s*\n((?:\s+\w+:.*\n?)*)/);
        if (envSection) {
          const envLines = envSection[1].match(/(\w+):\s*(.*)/g);
          if (envLines) {
            for (const el of envLines) {
              const m = el.match(/(\w+):\s*"?([^"]*)"?/);
              if (m) env[m[1]] = m[2];
            }
          }
        }
        form.integrations.push({ service: svcMatch[1].trim(), env });
      }
    }
  }

  return form;
}

// Collapsible section component
function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const testId = `section-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="border border-[var(--color-border-secondary)] rounded-md overflow-hidden">
      <button
        type="button"
        data-testid={`${testId}-toggle`}
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[var(--color-bg-tertiary)] text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      >
        {title}
        <span className="text-[10px]">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && <div className="p-3 space-y-3">{children}</div>}
    </div>
  );
}

export function AddSpecialistDialog({
  isOpen,
  onClose,
  onCreated,
}: AddSpecialistDialogProps): React.ReactElement | null {
  const [mode, setMode] = useState<DialogMode>('paste');
  const [name, setName] = useState('');
  const [markdownContent, setMarkdownContent] = useState('');
  const [services, setServices] = useState<ServiceBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [existingSpecialists, setExistingSpecialists] = useState<string[]>([]);
  const [validation, setValidation] = useState<{ valid: boolean; error?: string } | null>(null);
  const [guidedForm, setGuidedForm] = useState<GuidedFormState>({ ...DEFAULT_GUIDED_STATE, tools: [...DEFAULT_GUIDED_STATE.tools], schedules: [{ type: 'daily', cron: '0 0 * * *', enabled: true }], integrations: [] });
  const nameInputRef = useRef<HTMLInputElement>(null);
  const userHasEdited = useRef(false);
  const validationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing specialists for clone dropdown
  useEffect(() => {
    if (!isOpen) return;
    window.electronAPI.schedule.getSpecialists().then((specs) => {
      setExistingSpecialists(Object.keys(specs));
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setMode('paste');
    setName('');
    setMarkdownContent('');
    setServices([]);
    setError(null);
    setIsSubmitting(false);
    setTemplateName(null);
    setValidation(null);
    setGuidedForm({ ...DEFAULT_GUIDED_STATE, tools: [...DEFAULT_GUIDED_STATE.tools], schedules: [{ type: 'daily', cron: '0 0 * * *', enabled: true }], integrations: [] });
    userHasEdited.current = false;
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }, [isOpen]);

  // Fetch and populate template when templateName changes
  useEffect(() => {
    if (!templateName) return;
    let cancelled = false;
    window.electronAPI.schedule.getTemplate(templateName).then((template) => {
      if (!cancelled && !userHasEdited.current) {
        setMarkdownContent(template);
      }
    });
    return () => { cancelled = true; };
  }, [templateName]);

  const canCreate = useMemo(() => name.trim().length > 0 && !isSubmitting, [name, isSubmitting]);

  // Live validation (debounced)
  const runValidation = useCallback((content: string) => {
    if (validationTimer.current) clearTimeout(validationTimer.current);
    if (!content.trim()) {
      setValidation(null);
      return;
    }
    validationTimer.current = setTimeout(() => {
      setValidation(validateFrontmatter(content));
    }, 300);
  }, []);

  const handleMarkdownChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMarkdownContent(value);
    setError(null);
    userHasEdited.current = true;

    // Auto-detect name from pasted YAML
    const detectedName = extractNameFromMarkdown(value);
    if (detectedName && !name) {
      setName(detectedName);
    }

    // Parse integrations for credential fields
    const parsed = tryParseIntegrations(value);
    if (parsed.length > 0) {
      setServices(prev => {
        return parsed.map(newService => {
          const existing = prev.find(s => s.name === newService.name);
          if (!existing) return newService;
          return {
            name: newService.name,
            credentials: newService.credentials.map(cred => {
              const existingCred = existing.credentials.find(c => c.key === cred.key);
              return existingCred ? existingCred : cred;
            }),
          };
        });
      });
    }

    runValidation(value);
  }, [name, runValidation]);

  const handleSubmit = useCallback(async () => {
    const sanitizedName = sanitizeSpecialistName(name);
    if (!sanitizedName) return;

    setName(sanitizedName);
    setError(null);
    setIsSubmitting(true);

    try {
      let content: string | undefined;
      if (mode === 'guided') {
        const formWithName = { ...guidedForm, name: sanitizedName };
        content = serializeGuidedFormToMarkdown(formWithName);
      } else {
        content = markdownContent.trim() ? markdownContent : undefined;
      }

      const options = content ? { content } : undefined;
      await window.electronAPI.schedule.scaffold(sanitizedName, options);

      for (const service of services) {
        if (!service.name.trim()) continue;
        const creds: Record<string, string> = {};
        let hasValues = false;
        for (const c of service.credentials) {
          if (c.key.trim()) {
            creds[c.key.trim()] = c.value;
            if (c.value) hasValues = true;
          }
        }
        if (hasValues) {
          await window.electronAPI.schedule.saveCredentials(sanitizedName, service.name.trim(), creds);
        }
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create specialist.');
    } finally {
      setIsSubmitting(false);
    }
  }, [markdownContent, name, onCreated, services, mode, guidedForm]);

  const handleNameBlur = useCallback(() => {
    const sanitized = sanitizeSpecialistName(name);
    setName(sanitized);

    if (sanitized && !userHasEdited.current) {
      setTemplateName(sanitized);
    }
  }, [name]);

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [onClose]);

  // Service credential handlers
  const addService = useCallback(() => {
    setServices(prev => [...prev, { name: '', credentials: [{ key: '', value: '' }] }]);
  }, []);

  const removeService = useCallback((index: number) => {
    setServices(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateServiceName = useCallback((index: number, value: string) => {
    setServices(prev => prev.map((s, i) => i === index ? { ...s, name: value } : s));
  }, []);

  const addCredential = useCallback((serviceIndex: number) => {
    setServices(prev => prev.map((s, i) =>
      i === serviceIndex
        ? { ...s, credentials: [...s.credentials, { key: '', value: '' }] }
        : s
    ));
  }, []);

  const removeCredential = useCallback((serviceIndex: number, credIndex: number) => {
    setServices(prev => prev.map((s, i) =>
      i === serviceIndex
        ? { ...s, credentials: s.credentials.filter((_, ci) => ci !== credIndex) }
        : s
    ));
  }, []);

  const updateCredentialKey = useCallback((serviceIndex: number, credIndex: number, value: string) => {
    setServices(prev => prev.map((s, i) =>
      i === serviceIndex
        ? {
            ...s,
            credentials: s.credentials.map((c, ci) =>
              ci === credIndex ? { ...c, key: value } : c
            ),
          }
        : s
    ));
  }, []);

  const updateCredentialValue = useCallback((serviceIndex: number, credIndex: number, value: string) => {
    setServices(prev => prev.map((s, i) =>
      i === serviceIndex
        ? {
            ...s,
            credentials: s.credentials.map((c, ci) =>
              ci === credIndex ? { ...c, value } : c
            ),
          }
        : s
    ));
  }, []);

  // Mode switching
  const handleModeSwitch = useCallback((newMode: DialogMode) => {
    if (newMode === mode) return;

    if (newMode === 'guided' && markdownContent.trim()) {
      // Parse markdown into guided form
      const parsed = parseMarkdownToGuidedForm(markdownContent);
      if (name) parsed.name = name;
      setGuidedForm(parsed);
    } else if (newMode === 'paste') {
      // Serialize guided form to markdown
      const formWithName = { ...guidedForm, name: name || guidedForm.name };
      const serialized = serializeGuidedFormToMarkdown(formWithName);
      setMarkdownContent(serialized);
      userHasEdited.current = true;
      runValidation(serialized);
    }

    setMode(newMode);
  }, [mode, markdownContent, name, guidedForm, runValidation]);

  // Clone handler
  const handleClone = useCallback(async (specialistName: string) => {
    if (!specialistName) return;
    try {
      const raw = await window.electronAPI.schedule.getRawDefinition(specialistName);
      setMarkdownContent(raw);
      userHasEdited.current = true;
      setName('');
      setMode('paste');
      runValidation(raw);

      const parsed = tryParseIntegrations(raw);
      if (parsed.length > 0) {
        setServices(parsed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load specialist.');
    }
  }, [runValidation]);

  // Guided form update helpers
  const updateGuided = useCallback(<K extends keyof GuidedFormState>(key: K, value: GuidedFormState[K]) => {
    setGuidedForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggleTool = useCallback((tool: string) => {
    setGuidedForm(prev => ({
      ...prev,
      tools: prev.tools.includes(tool) ? prev.tools.filter(t => t !== tool) : [...prev.tools, tool],
    }));
  }, []);

  const updateSchedule = useCallback((index: number, field: string, value: string | boolean) => {
    setGuidedForm(prev => ({
      ...prev,
      schedules: prev.schedules.map((s, i) => i === index ? { ...s, [field]: value } : s),
    }));
  }, []);

  const addSchedule = useCallback(() => {
    setGuidedForm(prev => ({
      ...prev,
      schedules: [...prev.schedules, { type: 'custom', cron: '0 * * * *', enabled: true }],
    }));
  }, []);

  const removeSchedule = useCallback((index: number) => {
    setGuidedForm(prev => ({
      ...prev,
      schedules: prev.schedules.filter((_, i) => i !== index),
    }));
  }, []);

  const addGuidedIntegration = useCallback(() => {
    setGuidedForm(prev => ({
      ...prev,
      integrations: [...prev.integrations, { service: '', env: {} }],
    }));
  }, []);

  const removeGuidedIntegration = useCallback((index: number) => {
    setGuidedForm(prev => ({
      ...prev,
      integrations: prev.integrations.filter((_, i) => i !== index),
    }));
  }, []);

  if (!isOpen) return null;

  const inputClass = 'w-full rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)]';
  const labelClass = 'mb-1 block text-xs font-medium text-[var(--color-text-secondary)]';
  const selectClass = 'rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)]';

  return (
    <div
      data-testid="add-specialist-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="w-full max-w-3xl mx-4 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-5 shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Add Specialist</h2>
          {/* Clone from dropdown */}
          <select
            data-testid="specialist-clone-select"
            className={selectClass}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) handleClone(e.target.value);
              e.target.value = '';
            }}
          >
            <option value="" disabled>Clone from...</option>
            {existingSpecialists.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mb-4">
          Create a new scheduled specialist definition in <code>src/agents/cron/</code>.
        </p>

        {/* Mode Toggle */}
        <div className="flex gap-1 mb-4 p-0.5 rounded-md bg-[var(--color-bg-primary)] w-fit">
          <button
            type="button"
            data-testid="specialist-mode-paste"
            onClick={() => handleModeSwitch('paste')}
            className={`px-3 py-1 text-xs rounded ${mode === 'paste' ? 'bg-[var(--color-accent-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
          >
            Paste
          </button>
          <button
            type="button"
            data-testid="specialist-mode-guided"
            onClick={() => handleModeSwitch('guided')}
            className={`px-3 py-1 text-xs rounded ${mode === 'guided' ? 'bg-[var(--color-accent-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
          >
            Guided
          </button>
        </div>

        <div className="space-y-3">
          {/* Name Field */}
          <div>
            <label className={labelClass} htmlFor="specialist-name-input">
              Name *
            </label>
            <input
              id="specialist-name-input"
              ref={nameInputRef}
              data-testid="specialist-name-input"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onBlur={handleNameBlur}
              placeholder="e.g. code-quality"
              className={inputClass}
            />
          </div>

          {mode === 'paste' ? (
            /* ====== PASTE MODE ====== */
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-[var(--color-text-secondary)]" htmlFor="specialist-markdown-editor">
                  Definition (Markdown)
                </label>
                {validation && (
                  <span
                    data-testid="specialist-validation-badge"
                    className={`text-[10px] px-2 py-0.5 rounded-full ${
                      validation.valid
                        ? 'bg-[var(--color-status-success)]/20 text-[var(--color-status-success)]'
                        : 'bg-[var(--color-status-error)]/20 text-[var(--color-status-error)]'
                    }`}
                  >
                    {validation.valid ? 'Valid YAML' : validation.error}
                  </span>
                )}
              </div>
              <textarea
                id="specialist-markdown-editor"
                data-testid="specialist-markdown-editor"
                value={markdownContent}
                onChange={handleMarkdownChange}
                placeholder="Paste a specialist definition, or switch to Guided mode"
                className={`w-full rounded border ${
                  validation && !validation.valid ? 'border-[var(--color-status-error)]' : 'border-[var(--color-border-secondary)]'
                } bg-[var(--color-bg-primary)] px-3 py-2.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)] resize-y`}
                style={{ fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace", minHeight: '400px', lineHeight: '1.5' }}
              />
              <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                Paste a complete definition or enter a name above to auto-populate with the default template.
              </p>
            </div>
          ) : (
            /* ====== GUIDED MODE ====== */
            <div className="space-y-3">
              {/* Basics */}
              <Section title="Basics" defaultOpen={true}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Description</label>
                    <input
                      data-testid="guided-description"
                      type="text"
                      value={guidedForm.description}
                      onChange={(e) => updateGuided('description', e.target.value)}
                      placeholder="What does this specialist do?"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Model</label>
                    <select
                      data-testid="guided-model"
                      value={guidedForm.model}
                      onChange={(e) => updateGuided('model', e.target.value)}
                      className={`${inputClass} cursor-pointer`}
                    >
                      {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Tools</label>
                  <div className="flex flex-wrap gap-1.5">
                    {AVAILABLE_TOOLS.map(tool => (
                      <button
                        key={tool}
                        type="button"
                        data-testid={`guided-tool-${tool}`}
                        onClick={() => toggleTool(tool)}
                        className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                          guidedForm.tools.includes(tool)
                            ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10'
                            : 'border-[var(--color-border-secondary)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-primary)]'
                        }`}
                      >
                        {tool}
                      </button>
                    ))}
                  </div>
                </div>
              </Section>

              {/* Schedules */}
              <Section title="Schedules" defaultOpen={true}>
                {guidedForm.schedules.map((sched, si) => (
                  <div key={si} className="flex items-start gap-2 mb-2">
                    <select
                      value={sched.type}
                      onChange={(e) => updateSchedule(si, 'type', e.target.value)}
                      className={selectClass}
                    >
                      <option value="heartbeat">heartbeat</option>
                      <option value="daily">daily</option>
                      <option value="weekly">weekly</option>
                      <option value="custom">custom</option>
                    </select>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={sched.cron}
                        onChange={(e) => updateSchedule(si, 'cron', e.target.value)}
                        placeholder="*/30 * * * *"
                        className={`${inputClass} text-xs`}
                      />
                      <CronHelper value={sched.cron} onChange={(c) => updateSchedule(si, 'cron', c)} />
                    </div>
                    <label className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] mt-2">
                      <input
                        type="checkbox"
                        checked={sched.enabled}
                        onChange={(e) => updateSchedule(si, 'enabled', e.target.checked)}
                      />
                      On
                    </label>
                    <button
                      type="button"
                      onClick={() => removeSchedule(si)}
                      className="text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] text-sm mt-1.5"
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addSchedule}
                  className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)]"
                >
                  + Add schedule
                </button>
              </Section>

              {/* Memory */}
              <Section title="Memory">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Strategy</label>
                    <select
                      value={guidedForm.memory.strategy}
                      onChange={(e) => updateGuided('memory', { ...guidedForm.memory, strategy: e.target.value as MemoryStrategy })}
                      className={`${inputClass} cursor-pointer`}
                    >
                      {MEMORY_STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Max Entries</label>
                    <input
                      type="number"
                      value={guidedForm.memory.maxEntries}
                      onChange={(e) => updateGuided('memory', { ...guidedForm.memory, maxEntries: parseInt(e.target.value, 10) || 0 })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Retention Days</label>
                    <input
                      type="number"
                      value={guidedForm.memory.retentionDays}
                      onChange={(e) => updateGuided('memory', { ...guidedForm.memory, retentionDays: parseInt(e.target.value, 10) || 0 })}
                      className={inputClass}
                    />
                  </div>
                </div>
              </Section>

              {/* Escalation */}
              <Section title="Escalation">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>On Failure</label>
                    <select
                      value={guidedForm.escalation.onFailure || ''}
                      onChange={(e) => updateGuided('escalation', { ...guidedForm.escalation, onFailure: e.target.value as EscalationAction })}
                      className={`${inputClass} cursor-pointer`}
                    >
                      <option value="">None</option>
                      {ESCALATION_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>On Pattern</label>
                    <select
                      value={guidedForm.escalation.onPattern || ''}
                      onChange={(e) => updateGuided('escalation', { ...guidedForm.escalation, onPattern: e.target.value as EscalationAction })}
                      className={`${inputClass} cursor-pointer`}
                    >
                      <option value="">None</option>
                      {ESCALATION_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
              </Section>

              {/* Prompt Templates */}
              <Section title="Prompt Templates">
                {guidedForm.schedules.map((sched) => (
                  <div key={sched.type}>
                    <label className={labelClass}>{sched.type}</label>
                    <textarea
                      value={guidedForm.promptTemplates[sched.type] || ''}
                      onChange={(e) => updateGuided('promptTemplates', { ...guidedForm.promptTemplates, [sched.type]: e.target.value })}
                      placeholder={`Prompt template for ${sched.type} runs...`}
                      className={`${inputClass} text-xs resize-y`}
                      style={{ fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace", minHeight: '80px', lineHeight: '1.5' }}
                    />
                  </div>
                ))}
              </Section>

              {/* Integrations */}
              <Section title="Integrations">
                {guidedForm.integrations.map((int, ii) => (
                  <div key={ii} className="rounded-md border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] p-3 mb-2">
                    <div className="flex items-center justify-between mb-2">
                      <input
                        type="text"
                        value={int.service}
                        onChange={(e) => {
                          const updated = [...guidedForm.integrations];
                          updated[ii] = { ...updated[ii], service: e.target.value };
                          updateGuided('integrations', updated);
                        }}
                        placeholder="Service name"
                        className="bg-transparent border-b border-[var(--color-border-secondary)] py-0.5 text-xs font-medium text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)] w-[150px]"
                      />
                      <button
                        type="button"
                        onClick={() => removeGuidedIntegration(ii)}
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] text-sm px-1.5"
                      >
                        &times;
                      </button>
                    </div>
                    {Object.entries(int.env).map(([key]) => (
                      <div key={key} className="flex gap-2 items-center mb-1">
                        <span className="text-[11px] text-[var(--color-text-muted)] w-[120px]">{key}</span>
                        <input
                          type="password"
                          value={int.env[key]}
                          onChange={(e) => {
                            const updated = [...guidedForm.integrations];
                            updated[ii] = { ...updated[ii], env: { ...updated[ii].env, [key]: e.target.value } };
                            updateGuided('integrations', updated);
                          }}
                          placeholder="Value"
                          className={`flex-1 ${inputClass} text-xs`}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const keyName = `NEW_KEY_${Object.keys(int.env).length}`;
                        const updated = [...guidedForm.integrations];
                        updated[ii] = { ...updated[ii], env: { ...updated[ii].env, [keyName]: '' } };
                        updateGuided('integrations', updated);
                      }}
                      className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)] mt-1"
                    >
                      + Add env key
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addGuidedIntegration}
                  className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)]"
                >
                  + Add service
                </button>
              </Section>

              {/* System Prompt */}
              <div>
                <label className={labelClass}>System Prompt</label>
                <textarea
                  data-testid="guided-system-prompt"
                  value={guidedForm.systemPrompt}
                  onChange={(e) => updateGuided('systemPrompt', e.target.value)}
                  placeholder="# Specialist Name\n\nYou are a specialist agent..."
                  className={`w-full rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] px-3 py-2.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)] resize-y`}
                  style={{ fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace", minHeight: '200px', lineHeight: '1.5' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Service Credentials (shown in both modes) */}
        <hr className="border-[var(--color-border-primary)] my-5" />

        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Service Credentials</span>
          <button
            type="button"
            data-testid="specialist-add-service-btn"
            onClick={addService}
            className="rounded border border-[var(--color-border-secondary)] px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)]"
          >
            + Add Service
          </button>
        </div>

        {services.length === 0 && (
          <p className="text-center py-3 text-[11px] text-[var(--color-text-muted)]">
            No services configured. Add services manually or paste a definition with integrations above.
          </p>
        )}

        {services.map((service, si) => (
          <div
            key={si}
            className="mb-2.5 rounded-md border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <input
                data-testid={`specialist-service-name-${si}`}
                type="text"
                value={service.name}
                onChange={(e) => updateServiceName(si, e.target.value)}
                placeholder="Service name"
                className="bg-transparent border-b border-[var(--color-border-secondary)] py-0.5 text-xs font-medium text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)] w-[150px]"
              />
              <button
                type="button"
                data-testid={`specialist-remove-service-${si}`}
                onClick={() => removeService(si)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] text-sm px-1.5 py-0.5 rounded"
                title="Remove service"
              >
                &times;
              </button>
            </div>

            {service.credentials.map((cred, ci) => (
              <div key={ci} className="flex gap-2 items-center mb-1.5">
                <input
                  data-testid={`specialist-credential-key-${si}-${ci}`}
                  type="text"
                  value={cred.key}
                  onChange={(e) => updateCredentialKey(si, ci, e.target.value)}
                  placeholder="Key name"
                  className="flex-[0_0_40%] rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)]"
                />
                <input
                  data-testid={`specialist-credential-value-${si}-${ci}`}
                  type="password"
                  value={cred.value}
                  onChange={(e) => updateCredentialValue(si, ci, e.target.value)}
                  placeholder="Enter value"
                  className="flex-1 rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)]"
                />
                <button
                  type="button"
                  data-testid={`specialist-remove-credential-${si}-${ci}`}
                  onClick={() => removeCredential(si, ci)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] text-sm px-1 py-0.5 rounded"
                  title="Remove"
                >
                  &times;
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => addCredential(si)}
              className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)] mt-1"
            >
              + Add credential
            </button>
          </div>
        ))}

        {error && (
          <p className="mt-3 text-xs text-[var(--color-status-error)]">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            data-testid="specialist-cancel-btn"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="specialist-create-btn"
            onClick={handleSubmit}
            disabled={!canCreate}
            className="rounded bg-[var(--color-accent-primary)] px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

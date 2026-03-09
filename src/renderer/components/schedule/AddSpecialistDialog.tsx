import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

function sanitizeSpecialistName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function tryParseIntegrations(markdown: string): ServiceBlock[] {
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

export function AddSpecialistDialog({
  isOpen,
  onClose,
  onCreated,
}: AddSpecialistDialogProps): React.ReactElement | null {
  const [name, setName] = useState('');
  const [markdownContent, setMarkdownContent] = useState('');
  const [services, setServices] = useState<ServiceBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setMarkdownContent('');
    setServices([]);
    setError(null);
    setIsSubmitting(false);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }, [isOpen]);

  const canCreate = useMemo(() => name.trim().length > 0 && !isSubmitting, [name, isSubmitting]);

  const handleMarkdownChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMarkdownContent(value);
    setError(null);

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
  }, []);

  const handleSubmit = useCallback(async () => {
    const sanitizedName = sanitizeSpecialistName(name);
    if (!sanitizedName) return;

    setName(sanitizedName);
    setError(null);
    setIsSubmitting(true);

    try {
      const options = markdownContent.trim()
        ? { content: markdownContent }
        : undefined;
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
  }, [markdownContent, name, onCreated, services]);

  const handleNameBlur = useCallback(() => {
    setName((previous) => sanitizeSpecialistName(previous));
  }, []);

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

  if (!isOpen) return null;

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
      <div className="w-full max-w-lg mx-4 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-5 shadow-xl max-h-[85vh] overflow-y-auto">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Add Specialist</h2>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Create a new scheduled specialist definition in <code>src/agents/cron/</code>.
        </p>

        <div className="mt-4 space-y-3">
          {/* Name Field */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]" htmlFor="specialist-name-input">
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
              className="w-full rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)]"
            />
          </div>

          {/* Markdown Editor */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]" htmlFor="specialist-markdown-editor">
              Definition (Markdown)
            </label>
            <textarea
              id="specialist-markdown-editor"
              data-testid="specialist-markdown-editor"
              value={markdownContent}
              onChange={handleMarkdownChange}
              placeholder={'---\nname: my-specialist\ndescription: What this specialist does\nmodel: haiku\ntools:\n  - Read\n  - Grep\n  - Bash\nschedules:\n  - type: daily\n    cron: "0 0 * * *"\n    enabled: true\nintegrations:\n  - service: twitter\n    env:\n      TWITTER_API_KEY: ""\n      TWITTER_API_SECRET: ""\n---\n\n# My Specialist\n\nYour system prompt here...'}
              className="w-full rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] px-3 py-2.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)] resize-y"
              style={{ fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace", minHeight: '200px', lineHeight: '1.5' }}
            />
            <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
              Paste a full specialist definition with YAML frontmatter. Leave empty to use the default template.
            </p>
          </div>
        </div>

        {/* Divider */}
        <hr className="border-[var(--color-border-primary)] my-5" />

        {/* Service Credentials Section */}
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

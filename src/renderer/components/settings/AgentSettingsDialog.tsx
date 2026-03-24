/**
 * @module src/renderer/components/settings/AgentSettingsDialog
 * Settings dialog for managing agent definitions (built-in + custom).
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { trapFocus } from '@shared/lib/focus-trap';
import { isCloseShortcut } from '@renderer/lib/dialog-shortcuts';
import { useSuspendVimNavigation } from '@renderer/context/VimModeContext';
import type { AgentDefinition, CustomAgentInput } from '@shared/types/agent';

const AVAILABLE_TOOLS = [
  'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash',
  'Agent', 'WebSearch', 'WebFetch',
];

const MODELS = ['opus', 'sonnet', 'haiku'] as const;

interface AgentSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AgentFormState {
  name: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku';
  tools: string[];
  timeout: string;
  order: string;
  systemPrompt: string;
  isBuiltin: boolean;
  isNew: boolean;
}

const emptyForm: AgentFormState = {
  name: '',
  description: '',
  model: 'sonnet',
  tools: ['Read'],
  timeout: '',
  order: '',
  systemPrompt: '',
  isBuiltin: false,
  isNew: true,
};

export function AgentSettingsDialog({
  isOpen,
  onClose,
}: AgentSettingsDialogProps): React.ReactElement | null {
  useSuspendVimNavigation(isOpen);

  const dialogRef = useRef<HTMLDivElement>(null);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [form, setForm] = useState<AgentFormState | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Load agents when dialog opens
  useEffect(() => {
    if (!isOpen) return;
    loadAgents();
  }, [isOpen]);

  // Focus dialog on open
  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
    }
  }, [isOpen]);

  const loadAgents = useCallback(async () => {
    const defs = await window.electronAPI.agent.listDefinitions();
    setAgents(defs);
  }, []);

  const handleSelectAgent = useCallback(async (name: string) => {
    setSelectedAgent(name);
    setValidationError(null);
    const full = await window.electronAPI.agent.loadFullDefinition(name);
    setForm({
      name: full.name,
      description: full.description,
      model: full.model,
      tools: full.tools,
      timeout: full.timeout ? String(full.timeout) : '',
      order: full.order ? String(full.order) : '',
      systemPrompt: full.systemPrompt,
      isBuiltin: full.isBuiltin,
      isNew: false,
    });
  }, []);

  const handleNewAgent = useCallback(() => {
    setSelectedAgent(null);
    setValidationError(null);
    setForm({ ...emptyForm });
  }, []);

  const handleSave = useCallback(async () => {
    if (!form) return;
    if (!form.name.trim() || !form.description.trim()) {
      setValidationError('Name and description are required');
      return;
    }

    const def: CustomAgentInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      model: form.model,
      tools: form.tools,
      timeout: form.timeout ? parseInt(form.timeout, 10) : undefined,
      order: form.order ? parseInt(form.order, 10) : undefined,
      systemPrompt: form.systemPrompt,
    };

    await window.electronAPI.agent.saveDefinition(def);
    await loadAgents();
    setSelectedAgent(def.name);
    setValidationError(null);
  }, [form, loadAgents]);

  const handleDelete = useCallback(async () => {
    if (!form || form.isBuiltin) return;
    await window.electronAPI.agent.deleteDefinition(form.name);
    setForm(null);
    setSelectedAgent(null);
    await loadAgents();
  }, [form, loadAgents]);

  const handleToolToggle = useCallback((tool: string) => {
    if (!form) return;
    const newTools = form.tools.includes(tool)
      ? form.tools.filter(t => t !== tool)
      : [...form.tools, tool];
    setForm({ ...form, tools: newTools });
  }, [form]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (isCloseShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (dialogRef.current) {
      trapFocus(event, dialogRef.current);
    }
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Agent Settings"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 outline-none"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-[var(--color-bg-secondary)] rounded-lg shadow-xl border border-[var(--color-border-primary)] w-[900px] max-w-[90vw] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-primary)]">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Agent Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body: two-panel layout */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left panel: agent list */}
          <div className="w-64 border-r border-[var(--color-border-primary)] flex flex-col">
            <div className="p-3">
              <button
                data-testid="new-agent-button"
                onClick={handleNewAgent}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-[var(--color-accent-primary)] text-white hover:opacity-90 transition-opacity"
              >
                <Plus size={14} />
                New Agent
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
              {agents.map(agent => (
                <button
                  key={agent.name}
                  data-testid={`agent-list-item-${agent.name}`}
                  onClick={() => handleSelectAgent(agent.name)}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                    selectedAgent === agent.name
                      ? 'bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]'
                      : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{agent.name}</span>
                    {agent.isBuiltin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] ml-2 flex-shrink-0">
                        built-in
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right panel: edit form */}
          <div className="flex-1 overflow-y-auto p-6">
            {form ? (
              <div className="space-y-4">
                {validationError && (
                  <div className="text-sm text-[var(--color-status-error)] bg-[var(--color-status-error)]/10 rounded px-3 py-2">
                    {validationError}
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Name</label>
                  <input
                    data-testid="agent-name-input"
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    disabled={form.isBuiltin && !form.isNew}
                    className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-sm text-[var(--color-text-primary)] disabled:opacity-50"
                    placeholder="my-agent"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Description</label>
                  <input
                    data-testid="agent-description-input"
                    type="text"
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-sm text-[var(--color-text-primary)]"
                    placeholder="What this agent does"
                  />
                </div>

                {/* Model */}
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Model</label>
                  <select
                    data-testid="agent-model-select"
                    value={form.model}
                    onChange={e => setForm({ ...form, model: e.target.value as typeof form.model })}
                    className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-sm text-[var(--color-text-primary)]"
                  >
                    {MODELS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {/* Tools */}
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Tools</label>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_TOOLS.map(tool => (
                      <label key={tool} className="flex items-center gap-1.5 text-sm text-[var(--color-text-primary)]">
                        <input
                          type="checkbox"
                          checked={form.tools.includes(tool)}
                          onChange={() => handleToolToggle(tool)}
                          className="rounded border-[var(--color-border-primary)]"
                        />
                        {tool}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Timeout and Order */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Timeout (minutes)</label>
                    <input
                      data-testid="agent-timeout-input"
                      type="number"
                      value={form.timeout}
                      onChange={e => setForm({ ...form, timeout: e.target.value })}
                      className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-sm text-[var(--color-text-primary)]"
                      placeholder="30"
                      min="1"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Order (SDLC position)</label>
                    <input
                      data-testid="agent-order-input"
                      type="number"
                      value={form.order}
                      onChange={e => setForm({ ...form, order: e.target.value })}
                      className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-sm text-[var(--color-text-primary)]"
                      placeholder="1"
                      min="1"
                    />
                  </div>
                </div>

                {/* System Prompt */}
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">System Prompt</label>
                  <textarea
                    data-testid="agent-prompt-textarea"
                    value={form.systemPrompt}
                    onChange={e => setForm({ ...form, systemPrompt: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-sm text-[var(--color-text-primary)] font-mono min-h-[200px] resize-y"
                    placeholder="You are an agent that..."
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    data-testid="agent-save-button"
                    onClick={handleSave}
                    className="px-4 py-2 text-sm bg-[var(--color-accent-primary)] text-white rounded-md hover:opacity-90 transition-opacity"
                  >
                    Save
                  </button>
                  {!form.isBuiltin && !form.isNew && (
                    <button
                      data-testid="agent-delete-button"
                      onClick={handleDelete}
                      className="px-4 py-2 text-sm bg-[var(--color-status-error)] text-white rounded-md hover:opacity-90 transition-opacity"
                    >
                      Delete
                    </button>
                  )}
                  {form.isBuiltin && !form.isNew && (
                    <button
                      data-testid="agent-delete-button"
                      disabled
                      className="px-4 py-2 text-sm bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] rounded-md cursor-not-allowed opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-[var(--color-text-muted)]">
                Select an agent or create a new one
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { X, Plus } from 'lucide-react'
import type { KanbanAgentProvider, AgentDefinition } from '@shared/types/agent'
import { trapFocus } from '@shared/lib/focus-trap'

interface NewItemDialogProps {
  isOpen: boolean
  projectPath: string
  onClose: () => void
  onCreated: (item: { id: string; agentType?: string; agentProvider: string; description: string }) => void
}

const agentProviderOptions: { value: KanbanAgentProvider; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
  { value: 'opencode', label: 'OpenCode' },
]



export function NewItemDialog({
  isOpen,
  projectPath,
  onClose,
  onCreated,
}: NewItemDialogProps): React.ReactElement | null {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [branch, setBranch] = useState('')
  const [agentProvider, setAgentProvider] = useState<KanbanAgentProvider>('claude')
  const [agentType, setAgentType] = useState('plan-agent')
  const [model, setModel] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [agentDefinitions, setAgentDefinitions] = useState<AgentDefinition[]>([])
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({})
  const dialogRef = useRef<HTMLDivElement>(null)

  // Fetch agent definitions and provider models on mount
  useEffect(() => {
    window.electronAPI.agent.listDefinitions().then(setAgentDefinitions).catch(() => {})
    window.electronAPI.git.loadConfig().then(config => {
      if (config?.providerModels) {
        setProviderModels(config.providerModels)
      }
    }).catch(() => {})
  }, [])

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setDescription('')
      setBranch('')
      setAgentProvider('claude')
      setAgentType('plan-agent')
      setModel('')
      setIsSubmitting(false)
      setErrorMessage(null)
      // Refresh provider models when dialog opens
      window.electronAPI.git.loadConfig().then(config => {
        if (config?.providerModels) {
          setProviderModels(config.providerModels)
        }
      }).catch(() => {})
    }
  }, [isOpen])

  // Reset model when agent provider changes if current model isn't in new provider's list
  // Only reset when providerModels is populated (skip before settings are loaded)
  useEffect(() => {
    if (model && Object.keys(providerModels).length > 0) {
      const models = providerModels[agentProvider] || []
      if (!models.includes(model)) {
        setModel('')
      }
    }
  }, [agentProvider, providerModels, model])

  const canSubmit = title.trim().length > 0

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || isSubmitting) return

    setIsSubmitting(true)
    try {
      const result = await window.electronAPI.kanban.addItem(projectPath, {
        title: title.trim(),
        description: description.trim() || '',
        branch: branch.trim() || undefined,
        agentProvider,
        ...(agentType && { agentType }),
        order: 0,
        ...(model && { model }),
      })

      // Reset form
      setTitle('')
      setDescription('')
      setBranch('')
      setAgentProvider('claude')
      setAgentType('plan-agent')
      setModel('')

      setErrorMessage(null)
      onCreated({
        id: result.id,
        agentType: result.agentType,
        agentProvider: result.agentProvider,
        description: result.description,
      })
    } catch (error) {
      console.error('Failed to create item:', error)
      setErrorMessage('Failed to create item. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }, [canSubmit, isSubmitting, projectPath, title, description, branch, agentProvider, agentType, model, onCreated])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      if (e.key === 'Enter' && e.ctrlKey && canSubmit && !isSubmitting) {
        e.preventDefault()
        handleSubmit()
      }
      if (dialogRef.current) {
        trapFocus(e, dialogRef.current)
      }
    },
    [onClose, canSubmit, isSubmitting, handleSubmit]
  )

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg-secondary)]"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        data-testid="new-item-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Create new item"
        className="flex flex-col h-full"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">New Item</h2>
          <button
            data-testid="close-button"
            onClick={onClose}
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] rounded transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div className="flex items-center justify-between px-6 py-2 bg-red-900/30 border-b border-red-700/50 text-red-300 text-sm">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:text-[var(--color-text-primary)] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Content - Two pane layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left pane - Title, Description */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl">
              {/* Title */}
              <div className="mb-5">
                <label
                  htmlFor="new-item-title"
                  className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5"
                >
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  id="new-item-title"
                  data-testid="title-input"
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Enter task title"
                  autoFocus
                  className="w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                />
              </div>

              {/* Description */}
              <div className="mb-5">
                <label
                  htmlFor="new-item-description"
                  className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5"
                >
                  Description <span className="normal-case tracking-normal">(optional)</span>
                </label>
                <textarea
                  id="new-item-description"
                  data-testid="description-input"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe what needs to be done"
                  rows={10}
                  className="w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] resize-y"
                />
              </div>
            </div>
          </div>

          {/* Right pane - Sidebar */}
          <div className="w-72 overflow-y-auto border-l border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
            {/* Properties */}
            <div className="p-4 space-y-4">
              {/* Branch */}
              <div>
                <label
                  htmlFor="new-item-branch"
                  className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1"
                >
                  Branch <span className="normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  id="new-item-branch"
                  data-testid="branch-input"
                  type="text"
                  value={branch}
                  onChange={e => setBranch(e.target.value)}
                  placeholder="e.g., feature/my-feature"
                  className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                />
              </div>

              {/* Agent Provider */}
              <div>
                <label
                  htmlFor="new-item-agent-provider"
                  className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1"
                >
                  Agent Provider
                </label>
                <select
                  id="new-item-agent-provider"
                  data-testid="agent-provider-select"
                  value={agentProvider}
                  onChange={e => setAgentProvider(e.target.value as KanbanAgentProvider)}
                  className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                >
                  {agentProviderOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Agent Type */}
              {agentDefinitions.length > 0 && (
                <div>
                  <label
                    htmlFor="new-item-agent-type"
                    className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1"
                  >
                    Agent Type <span className="normal-case tracking-normal">(optional)</span>
                  </label>
                  <select
                    id="new-item-agent-type"
                    data-testid="agent-type-select"
                    value={agentType}
                    onChange={e => setAgentType(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                  >
                    <option value="">Not set</option>
                    {agentDefinitions.map(agent => (
                      <option key={agent.name} value={agent.name}>
                        {agent.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Model Override */}
              <div>
                <label
                  htmlFor="new-item-model"
                  className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1"
                >
                  Model <span className="normal-case tracking-normal">(optional)</span>
                </label>
                <select
                  id="new-item-model"
                  data-testid="model-select"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                >
                  <option value="">Provider default</option>
                  {(providerModels[agentProvider] || []).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                  Leave empty to use provider default
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="p-4 border-t border-[var(--color-border-primary)]">
              <div className="space-y-2">
                <button
                  data-testid="create-button"
                  onClick={handleSubmit}
                  disabled={!canSubmit || isSubmitting}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-[var(--color-accent-primary)] text-white rounded-md hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={14} />
                  {isSubmitting ? 'Creating...' : 'Create'}
                  <span className="text-xs opacity-60 ml-1">(Ctrl+Enter)</span>
                </button>
                <button
                  data-testid="cancel-button"
                  onClick={onClose}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-[var(--color-text-secondary)] rounded-md hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-auto p-4 border-t border-[var(--color-border-primary)]">
              <p className="text-center text-[10px] text-[var(--color-text-tertiary)]">
                Esc to close
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

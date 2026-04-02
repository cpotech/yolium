import React, { useState, useCallback, useEffect, useRef } from 'react'
import { X, Plus } from 'lucide-react'
import type { KanbanAgentProvider, AgentDefinition } from '@shared/types/agent'
import { trapFocus } from '@shared/lib/focus-trap'
import { useSuspendVimNavigation } from '@renderer/context/VimModeContext'
import { isCloseShortcut } from '@renderer/lib/dialog-shortcuts'

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
  { value: 'openrouter', label: 'OpenRouter' },
]



export function NewItemDialog({
  isOpen,
  projectPath,
  onClose,
  onCreated,
}: NewItemDialogProps): React.ReactElement | null {
  useSuspendVimNavigation(isOpen)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [branch, setBranch] = useState('')
  const [agentProvider, setAgentProvider] = useState<KanbanAgentProvider>('claude')
  const [defaultProvider, setDefaultProvider] = useState<KanbanAgentProvider>('claude')
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
      if (config?.defaultProvider) {
        setDefaultProvider(config.defaultProvider)
      }
    }).catch(() => {})
  }, [])

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setDescription('')
      setBranch('')
      setAgentType('plan-agent')
      setModel('')
      setIsSubmitting(false)
      setErrorMessage(null)
      // Refresh provider models and default provider when dialog opens
      window.electronAPI.git.loadConfig().then(config => {
        if (config?.providerModels) {
          setProviderModels(config.providerModels)
        }
        const provider = config?.defaultProvider ?? 'claude'
        setDefaultProvider(provider)
        setAgentProvider(provider)
      }).catch(() => {
        setAgentProvider('claude')
      })
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
      setAgentProvider(defaultProvider)
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
  }, [canSubmit, isSubmitting, projectPath, title, description, branch, agentProvider, agentType, model, defaultProvider, onCreated])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isCloseShortcut(e)) {
        e.preventDefault()
        e.stopPropagation()
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
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/50"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        data-testid="new-item-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Create new item"
        className="w-full max-w-xl bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border-primary)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border-primary)]">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">New Item</h2>
          <div className="flex items-center gap-2">
            <kbd className="text-xs bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 rounded text-[var(--color-text-muted)]">Ctrl+Q</kbd>
            <button
              data-testid="close-button"
              onClick={onClose}
              className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] rounded transition-colors flex-shrink-0"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div className="flex items-center justify-between px-5 py-2 bg-red-900/30 border-b border-red-700/50 text-red-300 text-sm">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:text-[var(--color-text-primary)] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Form */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto yolium-scrollbar">
          {/* Title */}
          <div>
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
              className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
            />
          </div>

          {/* Description */}
          <div>
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
              rows={4}
              className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] resize-y"
            />
          </div>

          {/* Config fields - compact grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Branch */}
            <div className="col-span-2">
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
                spellCheck={false}
                className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
              />
            </div>

            {/* Agent Provider */}
            <div>
              <label
                htmlFor="new-item-agent-provider"
                className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1"
              >
                Provider
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
                  Agent Type
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
            <div className={agentDefinitions.length > 0 ? 'col-span-2' : ''}>
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
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)]">
          <button
            data-testid="cancel-button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-[var(--color-text-secondary)] rounded-md hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="create-button"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-[var(--color-accent-primary)] text-white rounded-md hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={14} />
            {isSubmitting ? 'Creating...' : 'Create'}
            <span className="text-xs opacity-60 ml-1">Ctrl+Enter</span>
          </button>
        </div>
      </div>
    </div>
  )
}

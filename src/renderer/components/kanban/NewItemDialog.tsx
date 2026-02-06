import React, { useState, useCallback, useEffect, useRef } from 'react'
import { X, Plus } from 'lucide-react'
import type { KanbanAgentType } from '@shared/types/agent'
import { trapFocus } from '@shared/lib/focus-trap'

interface NewItemDialogProps {
  isOpen: boolean
  projectPath: string
  onClose: () => void
  onCreated: () => void
}

const agentTypeOptions: { value: KanbanAgentType; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
  { value: 'opencode', label: 'OpenCode' },
]

const modelOptions: { value: string; label: string }[] = [
  { value: '', label: 'Agent default' },
  { value: 'opus', label: 'Opus (most capable)' },
  { value: 'sonnet', label: 'Sonnet (balanced)' },
  { value: 'haiku', label: 'Haiku (fastest)' },
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
  const [agentType, setAgentType] = useState<KanbanAgentType>('claude')
  const [model, setModel] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setDescription('')
      setBranch('')
      setAgentType('claude')
      setModel('')
      setIsSubmitting(false)
      setErrorMessage(null)
    }
  }, [isOpen])

  const canSubmit = title.trim().length > 0 && description.trim().length > 0

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || isSubmitting) return

    setIsSubmitting(true)
    try {
      await window.electronAPI.kanban.addItem(projectPath, {
        title: title.trim(),
        description: description.trim(),
        branch: branch.trim() || undefined,
        agentType,
        order: 0,
        ...(model && { model }),
      })

      // Reset form
      setTitle('')
      setDescription('')
      setBranch('')
      setAgentType('claude')
      setModel('')

      setErrorMessage(null)
      onCreated()
    } catch (error) {
      console.error('Failed to create item:', error)
      setErrorMessage('Failed to create item. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }, [canSubmit, isSubmitting, projectPath, title, description, branch, agentType, model, onCreated])

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
          <h2 className="text-base font-semibold text-white">New Item</h2>
          <button
            data-testid="close-button"
            onClick={onClose}
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-primary)] rounded transition-colors flex-shrink-0"
            title="Esc to close"
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
              className="p-1 hover:text-white transition-colors"
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
                  className="w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                />
              </div>

              {/* Description */}
              <div className="mb-5">
                <label
                  htmlFor="new-item-description"
                  className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5"
                >
                  Description <span className="text-red-400">*</span>
                </label>
                <textarea
                  id="new-item-description"
                  data-testid="description-input"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe what needs to be done"
                  rows={10}
                  className="w-full px-3 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] resize-y"
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
                  className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                />
              </div>

              {/* Agent Type */}
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
                  onChange={e => setAgentType(e.target.value as KanbanAgentType)}
                  className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                >
                  {agentTypeOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

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
                  className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                >
                  {modelOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="p-4 border-t border-[var(--color-border-primary)]">
              <div className="space-y-2">
                <button
                  data-testid="create-button"
                  onClick={handleSubmit}
                  disabled={!canSubmit || isSubmitting}
                  title="Ctrl+Enter"
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-[var(--color-accent-primary)] text-white rounded-md hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={14} />
                  {isSubmitting ? 'Creating...' : 'Create'}
                  <span className="text-xs opacity-60 ml-1">(Ctrl+Enter)</span>
                </button>
                <button
                  data-testid="cancel-button"
                  onClick={onClose}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-[var(--color-text-secondary)] rounded-md hover:text-white hover:bg-[var(--color-bg-primary)] transition-colors"
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

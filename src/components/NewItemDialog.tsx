import React, { useState, useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { KanbanAgentType } from '../types/agent'
import { trapFocus } from '../lib/focus-trap'

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onKeyDown={handleKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        data-testid="new-item-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Create new item"
        className="bg-[var(--color-bg-secondary)] rounded-lg shadow-xl border border-[var(--color-border-primary)] p-6 max-w-md w-full mx-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">New Item</h2>
          <button
            data-testid="close-button"
            onClick={onClose}
            className="p-1 text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded-md text-red-300 text-sm">
            {errorMessage}
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={e => {
            e.preventDefault()
            handleSubmit()
          }}
          className="space-y-4"
        >
          {/* Title */}
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
            >
              Title <span className="text-red-400">*</span>
            </label>
            <input
              id="title"
              data-testid="title-input"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Enter task title"
              className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
            >
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              id="description"
              data-testid="description-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe what needs to be done"
              rows={4}
              className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] resize-none"
            />
          </div>

          {/* Branch */}
          <div>
            <label
              htmlFor="branch"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
            >
              Branch <span className="text-[var(--color-text-tertiary)]">(optional)</span>
            </label>
            <input
              id="branch"
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
              htmlFor="agentType"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
            >
              Agent Type
            </label>
            <select
              id="agentType"
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
              htmlFor="model"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
            >
              Model <span className="text-[var(--color-text-tertiary)]">(optional)</span>
            </label>
            <select
              id="model"
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

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-[var(--color-text-tertiary)]">
              Ctrl+Enter to create &middot; Esc to close
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="cancel-button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="create-button"
                disabled={!canSubmit || isSubmitting}
                className="px-4 py-2 text-sm bg-[var(--color-accent-primary)] text-white rounded-md hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

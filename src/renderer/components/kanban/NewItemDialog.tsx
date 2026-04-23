import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { X, Plus } from 'lucide-react'
import type { KanbanAgentProvider, AgentDefinition } from '@shared/types/agent'
import type { CavemanMode } from '@shared/types/kanban'
import { trapFocus } from '@shared/lib/focus-trap'
import { useSuspendVimNavigation, useVimModeContext } from '@renderer/context/VimModeContext'
import { useVimListNavigation } from '@renderer/hooks/useVimListNavigation'
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
  { value: 'xai', label: 'xAI' },
]

const cavemanOptions: { value: CavemanMode | 'inherit'; label: string }[] = [
  { value: 'inherit', label: 'Inherit from project' },
  { value: 'off', label: 'Off' },
  { value: 'lite', label: 'Lite (~25% fewer tokens)' },
  { value: 'full', label: 'Full (~75% fewer tokens)' },
  { value: 'ultra', label: 'Ultra (~85% fewer tokens)' },
]

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StagedFileThumbnail({ file, index, onRemove }: { file: File; index: number; onRemove: (index: number) => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const isImage = file.type.startsWith('image/')

  useEffect(() => {
    if (!isImage) return
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file, isImage])

  return (
    <div
      data-testid={`staged-file-${index}`}
      className="relative group border border-[var(--color-border-primary)] rounded-md overflow-hidden bg-[var(--color-bg-primary)]"
    >
      {isImage && previewUrl ? (
        <img src={previewUrl} alt={file.name} className="w-full h-20 object-cover" />
      ) : (
        <div className="w-full h-20 flex items-center justify-center text-[var(--color-text-tertiary)]">
          <div className="text-xl">{file.name.split('.').pop()?.toUpperCase() || 'FILE'}</div>
        </div>
      )}
      <div className="px-2 py-1 text-xs text-[var(--color-text-secondary)] truncate">
        {file.name}
        <span className="ml-1 text-[var(--color-text-tertiary)]">({formatFileSize(file.size)})</span>
      </div>
      <button
        data-testid={`remove-file-${index}`}
        onClick={() => onRemove(index)}
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
        title="Remove file"
      >
        x
      </button>
    </div>
  )
}

const kbdClass = 'px-1.5 py-0.5 text-xs bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)]'

export function NewItemDialog({
  isOpen,
  projectPath,
  onClose,
  onCreated,
}: NewItemDialogProps): React.ReactElement | null {
  useSuspendVimNavigation(isOpen)
  const vim = useVimModeContext()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [branch, setBranch] = useState('')
  const [agentProvider, setAgentProvider] = useState<KanbanAgentProvider>('claude')
  const [defaultProvider, setDefaultProvider] = useState<KanbanAgentProvider>('claude')
  const [agentType, setAgentType] = useState('plan-agent')
  const [model, setModel] = useState('')
  const [cavemanMode, setCavemanMode] = useState<CavemanMode | 'inherit'>('inherit')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [agentDefinitions, setAgentDefinitions] = useState<AgentDefinition[]>([])
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({})
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [focusedFieldIndex, setFocusedFieldIndex] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Focus sentinel: reclaim focus when it escapes the dialog container
  const handleBlur = useCallback((event: React.FocusEvent) => {
    if (!event.relatedTarget || !dialogRef.current?.contains(event.relatedTarget as Node)) {
      requestAnimationFrame(() => {
        if (isOpen && dialogRef.current && !dialogRef.current.contains(document.activeElement)) {
          dialogRef.current.focus()
        }
      })
    }
  }, [isOpen])

  // Build navigable field IDs, handling conditional agent-type field
  const navigableFieldIds = useMemo(() => {
    const ids = [
      'new-item-title',
      'new-item-description',
      'new-item-branch',
      'new-item-agent-provider',
    ]
    if (agentDefinitions.length > 0) {
      ids.push('new-item-agent-type')
    }
    ids.push('new-item-model')
    return ids
  }, [agentDefinitions.length])

  const { handleNavKeys: handleFieldNavKeys } = useVimListNavigation({
    itemCount: navigableFieldIds.length,
    enabled: vim.mode === 'NORMAL' && isOpen,
    onIndexChange: setFocusedFieldIndex,
    currentIndex: focusedFieldIndex,
    wrap: false,
  })

  const focusField = useCallback((index: number) => {
    const fieldId = navigableFieldIds[index]
    if (fieldId) {
      const el = document.getElementById(fieldId)
      el?.focus()
      vim.enterInsertMode()
    }
  }, [navigableFieldIds, vim])

  const handleFieldFocus = useCallback((fieldId: string) => {
    const idx = navigableFieldIds.indexOf(fieldId)
    if (idx >= 0) {
      setFocusedFieldIndex(idx)
      vim.enterInsertMode()
    }
  }, [navigableFieldIds, vim])

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

  // Reset form and vim state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      vim.exitToNormal()
      setTitle('')
      setDescription('')
      setBranch('')
      setAgentType('plan-agent')
      setModel('')
      setCavemanMode('inherit')
      setIsSubmitting(false)
      setErrorMessage(null)
      setStagedFiles([])
      setFocusedFieldIndex(0)
      // Focus dialog container so NORMAL mode keyboard nav works immediately
      dialogRef.current?.focus()
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

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setStagedFiles(prev => [...prev, ...Array.from(files)])
    e.target.value = ''
  }, [])

  const handleRemoveFile = useCallback((index: number) => {
    setStagedFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleDescriptionPaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    let hasImage = false
    for (const clipItem of items) {
      if (clipItem.type.startsWith('image/')) {
        if (!hasImage) {
          e.preventDefault()
          hasImage = true
        }
        const blob = clipItem.getAsFile()
        if (blob) {
          const ext = clipItem.type.split('/')[1] || 'png'
          const filename = `paste-${Date.now()}-${crypto.randomUUID()}.${ext}`
          const file = new File([blob], filename, { type: blob.type })
          setStagedFiles(prev => [...prev, file])
        }
      }
    }
  }, [])

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
        ...(cavemanMode !== 'inherit' && { cavemanMode }),
      })

      // Upload staged files to the newly created item
      if (stagedFiles.length > 0) {
        await Promise.all(
          stagedFiles.map(async (file) => {
            try {
              const buffer = await file.arrayBuffer()
              const base64 = btoa(
                new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
              )
              await window.electronAPI.kanban.addAttachment(
                projectPath, result.id, file.name, file.type || 'application/octet-stream', base64
              )
            } catch {
              // Attachment upload failure should not block item creation
            }
          })
        )
      }

      // Reset form
      setTitle('')
      setDescription('')
      setBranch('')
      setAgentProvider(defaultProvider)
      setAgentType('plan-agent')
      setModel('')
      setCavemanMode('inherit')
      setStagedFiles([])

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
  }, [canSubmit, isSubmitting, projectPath, title, description, branch, agentProvider, agentType, model, cavemanMode, defaultProvider, onCreated, stagedFiles])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl+Enter to create (both modes)
      if (e.key === 'Enter' && e.ctrlKey && canSubmit && !isSubmitting) {
        e.preventDefault()
        handleSubmit()
        return
      }

      // Ctrl+Q / close shortcut (both modes)
      if (isCloseShortcut(e)) {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }

      // Vim-mode-aware Escape handling
      if (e.key === 'Escape') {
        e.preventDefault()
        if (vim.mode === 'INSERT') {
          vim.exitToNormal()
          dialogRef.current?.focus()
        } else {
          onClose()
        }
        return
      }

      // NORMAL mode shortcuts
      if (vim.mode === 'NORMAL') {
        // i or Enter to edit focused field
        if (e.key === 'i' || e.key === 'Enter') {
          e.preventDefault()
          focusField(focusedFieldIndex)
          return
        }

        // j/k/gg/G navigation
        if (handleFieldNavKeys(e)) {
          e.preventDefault()
          return
        }
      }

      // Trap focus within dialog (both modes)
      if (dialogRef.current) {
        trapFocus(e, dialogRef.current)
      }
    },
    [onClose, canSubmit, isSubmitting, handleSubmit, vim, focusField, focusedFieldIndex, handleFieldNavKeys]
  )

  if (!isOpen) return null

  const isNormal = vim.mode === 'NORMAL'

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
        tabIndex={-1}
        onBlur={handleBlur}
        onPaste={handleDescriptionPaste}
        className="w-full max-w-xl bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border-primary)] shadow-2xl overflow-hidden focus:outline-none"
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
          <div {...(isNormal && focusedFieldIndex === 0 ? { 'data-testid': 'focused-field-indicator' } : {})}
            className={isNormal && focusedFieldIndex === 0 ? 'ring-2 ring-[var(--color-accent-primary)] rounded-md' : ''}
          >
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
              onFocus={() => handleFieldFocus('new-item-title')}
              placeholder="Enter task title"
              className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
            />
          </div>

          {/* Description */}
          <div {...(isNormal && focusedFieldIndex === 1 ? { 'data-testid': 'focused-field-indicator' } : {})}
            className={isNormal && focusedFieldIndex === 1 ? 'ring-2 ring-[var(--color-accent-primary)] rounded-md' : ''}
          >
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
              onFocus={() => handleFieldFocus('new-item-description')}
              placeholder="Describe what needs to be done"
              rows={4}
              className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] resize-y"
            />
          </div>

          {/* Attachments */}
          <div data-testid="attachments-section">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Attachments{stagedFiles.length > 0 ? ` (${stagedFiles.length})` : ''}
              </label>
              <button
                data-testid="add-attachment-btn"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2 py-1 text-xs bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] rounded hover:border-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)] transition-colors"
              >
                + Add file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                data-testid="file-input"
              />
            </div>

            {stagedFiles.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {stagedFiles.map((file, index) => (
                  <StagedFileThumbnail key={`${file.name}-${index}`} file={file} index={index} onRemove={handleRemoveFile} />
                ))}
              </div>
            ) : (
              <div
                data-testid="empty-attachments"
                className="border border-dashed border-[var(--color-border-primary)] rounded-md p-3 text-center text-xs text-[var(--color-text-tertiary)]"
              >
                Paste an image or click &quot;+ Add file&quot;
              </div>
            )}
          </div>

          {/* Config fields - compact grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Branch */}
            <div className={`col-span-2${isNormal && focusedFieldIndex === 2 ? ' ring-2 ring-[var(--color-accent-primary)] rounded-md' : ''}`}
              {...(isNormal && focusedFieldIndex === 2 ? { 'data-testid': 'focused-field-indicator' } : {})}
            >
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
                onFocus={() => handleFieldFocus('new-item-branch')}
                placeholder="e.g., feature/my-feature"
                spellCheck={false}
                className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
              />
            </div>

            {/* Agent Provider */}
            <div {...(isNormal && focusedFieldIndex === 3 ? { 'data-testid': 'focused-field-indicator' } : {})}
              className={isNormal && focusedFieldIndex === 3 ? 'ring-2 ring-[var(--color-accent-primary)] rounded-md' : ''}
            >
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
                onFocus={() => handleFieldFocus('new-item-agent-provider')}
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
              <div {...(isNormal && focusedFieldIndex === 4 ? { 'data-testid': 'focused-field-indicator' } : {})}
                className={isNormal && focusedFieldIndex === 4 ? 'ring-2 ring-[var(--color-accent-primary)] rounded-md' : ''}
              >
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
                  onFocus={() => handleFieldFocus('new-item-agent-type')}
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
            {(() => {
              const modelFieldIndex = agentDefinitions.length > 0 ? 5 : 4
              return (
                <div className={agentDefinitions.length > 0 ? 'col-span-2' : ''}
                  {...(isNormal && focusedFieldIndex === modelFieldIndex ? { 'data-testid': 'focused-field-indicator' } : {})}
                >
                  <div className={isNormal && focusedFieldIndex === modelFieldIndex ? 'ring-2 ring-[var(--color-accent-primary)] rounded-md' : ''}>
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
                      onFocus={() => handleFieldFocus('new-item-model')}
                      className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
                    >
                      <option value="">Provider default</option>
                      {(providerModels[agentProvider] || []).map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            })()}

            {/* Caveman Mode */}
            <div className="col-span-2">
              <label
                htmlFor="new-item-caveman-mode"
                className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1"
              >
                Caveman Mode <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <select
                id="new-item-caveman-mode"
                data-testid="caveman-mode-select"
                value={cavemanMode}
                onChange={e => setCavemanMode(e.target.value as CavemanMode | 'inherit')}
                className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-md text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]"
              >
                {cavemanOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
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
          </button>
        </div>

        {/* Shortcuts hint bar */}
        <div
          data-testid="shortcuts-hint-bar"
          className="flex items-center gap-3 px-4 py-1.5 bg-[var(--color-bg-tertiary)] border-t border-[var(--color-border-primary)] text-xs text-[var(--color-text-muted)]"
        >
          {vim.mode === 'NORMAL' ? (
            <>
              <span><kbd className={kbdClass}>j/k</kbd> Navigate</span>
              <span><kbd className={kbdClass}>gg</kbd> First</span>
              <span><kbd className={kbdClass}>G</kbd> Last</span>
              <span><kbd className={kbdClass}>i</kbd> Edit field</span>
              <span><kbd className={kbdClass}>Ctrl+Q</kbd> Close</span>
            </>
          ) : (
            <>
              <span><kbd className={kbdClass}>Esc</kbd> Normal mode</span>
              <span><kbd className={kbdClass}>Tab</kbd> Next field</span>
              <span><kbd className={kbdClass}>Ctrl+Enter</kbd> Create</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KanbanColumn, KanbanItem } from '@shared/types/kanban'

export type DraftSaveStatus = 'idle' | 'saving' | 'saved' | 'error'
export type DraftFlushReason = 'manual' | 'autosave' | 'close'

interface DraftValues {
  title: string
  description: string
  column: KanbanColumn
  agentType: string
  agentProvider: KanbanItem['agentProvider']
  model: string
  verified: boolean
}

interface UseItemDetailDraftOptions {
  item: KanbanItem | null
  isOpen: boolean
  projectPath: string
  onUpdated: () => void
  setErrorMessage?: (message: string | null) => void
}

interface FlushOptions {
  reason: DraftFlushReason
  refreshBoard: boolean
}

const emptyDraftValues: DraftValues = {
  title: '',
  description: '',
  column: 'backlog',
  agentType: '',
  agentProvider: 'claude',
  model: '',
  verified: false,
}

function getDraftValues(item: KanbanItem | null): DraftValues {
  if (!item) return emptyDraftValues

  return {
    title: item.title,
    description: item.description,
    column: item.column,
    agentType: item.agentType || '',
    agentProvider: item.agentProvider,
    model: item.model || '',
    verified: item.verified ?? false,
  }
}

export interface ItemDetailDraftController extends DraftValues {
  setTitle: (title: string) => void
  setDescription: (description: string) => void
  setColumn: (column: KanbanColumn) => void
  setAgentType: (agentType: string) => void
  setAgentProvider: (provider: KanbanItem['agentProvider']) => void
  setModel: (model: string) => void
  setVerified: (verified: boolean) => void
  hasUnsavedChanges: boolean
  saveStatus: DraftSaveStatus
  providerModels: Record<string, string[]>
  flushDraft: (reason: DraftFlushReason) => Promise<boolean>
}

export function useItemDetailDraft({
  item,
  isOpen,
  projectPath,
  onUpdated,
  setErrorMessage,
}: UseItemDetailDraftOptions): ItemDetailDraftController {
  const [draft, setDraft] = useState<DraftValues>(() => getDraftValues(item))
  const [baseDraft, setBaseDraft] = useState<DraftValues>(() => getDraftValues(item))
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>('idle')
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({})
  const prevItemIdRef = useRef<string | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasUnsavedChanges = useMemo(
    () =>
      draft.title !== baseDraft.title ||
      draft.description !== baseDraft.description ||
      draft.column !== baseDraft.column ||
      draft.agentType !== baseDraft.agentType ||
      draft.agentProvider !== baseDraft.agentProvider ||
      draft.model !== baseDraft.model ||
      draft.verified !== baseDraft.verified,
    [draft, baseDraft],
  )

  useEffect(() => {
    if (!isOpen) return

    window.electronAPI.git.loadConfig().then(config => {
      if (config?.providerModels) {
        setProviderModels(config.providerModels)
      }
    }).catch(() => {})
  }, [isOpen])

  useEffect(() => {
    if (draft.model && Object.keys(providerModels).length > 0) {
      const models = providerModels[draft.agentProvider] || []
      if (!models.includes(draft.model)) {
        setDraft(prev => ({ ...prev, model: '' }))
      }
    }
  }, [draft.agentProvider, draft.model, providerModels])

  useEffect(() => {
    if (!item) return

    if (item.id !== prevItemIdRef.current) {
      const nextDraft = getDraftValues(item)
      setDraft(nextDraft)
      setBaseDraft(nextDraft)
      setSaveStatus('idle')
      prevItemIdRef.current = item.id
    }
  }, [item])

  const persistDraft = useCallback(async ({
    reason,
    refreshBoard,
  }: FlushOptions): Promise<boolean> => {
    if (!item || saveStatus === 'saving') return false

    setSaveStatus('saving')

    try {
      const trimmedTitle = draft.title.trim()
      const trimmedDescription = draft.description.trim()
      await window.electronAPI.kanban.updateItem(projectPath, item.id, {
        title: trimmedTitle,
        description: trimmedDescription,
        column: draft.column,
        agentType: draft.agentType || undefined,
        agentProvider: draft.agentProvider,
        model: draft.model || undefined,
        verified: draft.verified,
      })

      setBaseDraft({
        title: trimmedTitle,
        description: trimmedDescription,
        column: draft.column,
        agentType: draft.agentType,
        agentProvider: draft.agentProvider,
        model: draft.model,
        verified: draft.verified,
      })
      setErrorMessage?.(null)
      setSaveStatus('saved')

      if (savedFadeTimerRef.current) clearTimeout(savedFadeTimerRef.current)
      savedFadeTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)

      if (refreshBoard && reason !== 'autosave') {
        onUpdated()
      }

      return true
    } catch (error) {
      console.error('Failed to update item:', error)
      setErrorMessage?.('Failed to save changes. Please try again.')
      setSaveStatus('error')
      return false
    }
  }, [draft, item, onUpdated, projectPath, saveStatus, setErrorMessage])

  const flushDraft = useCallback(async (reason: DraftFlushReason) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }

    if (!item || !hasUnsavedChanges) return false

    return persistDraft({
      reason,
      refreshBoard: reason !== 'autosave',
    })
  }, [hasUnsavedChanges, item, persistDraft])

  useEffect(() => {
    if (!hasUnsavedChanges || !draft.title.trim()) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
      return
    }

    autoSaveTimerRef.current = setTimeout(() => {
      void persistDraft({ reason: 'autosave', refreshBoard: false })
    }, 800)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
    }
  }, [draft, hasUnsavedChanges, persistDraft])

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      if (savedFadeTimerRef.current) clearTimeout(savedFadeTimerRef.current)
    }
  }, [])

  return {
    ...draft,
    setTitle: title => setDraft(prev => ({ ...prev, title })),
    setDescription: description => setDraft(prev => ({ ...prev, description })),
    setColumn: column => setDraft(prev => ({ ...prev, column })),
    setAgentType: agentType => setDraft(prev => ({ ...prev, agentType })),
    setAgentProvider: agentProvider => setDraft(prev => ({ ...prev, agentProvider })),
    setModel: model => setDraft(prev => ({ ...prev, model })),
    setVerified: verified => setDraft(prev => ({ ...prev, verified })),
    hasUnsavedChanges,
    saveStatus,
    providerModels,
    flushDraft,
  }
}

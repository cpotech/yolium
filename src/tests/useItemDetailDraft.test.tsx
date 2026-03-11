/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useItemDetailDraft } from '@renderer/components/kanban/item-detail/useItemDetailDraft'
import type { KanbanItem } from '@shared/types/kanban'

const mockUpdateItem = vi.fn()
const mockLoadConfig = vi.fn()

function createMockItem(overrides: Partial<KanbanItem> = {}): KanbanItem {
  return {
    id: 'item-1',
    title: 'Test Item',
    description: 'Test description',
    column: 'backlog',
    branch: 'feature/test-item',
    agentProvider: 'claude',
    order: 0,
    agentStatus: 'idle',
    model: 'claude-model',
    comments: [],
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T12:00:00.000Z',
    ...overrides,
  }
}

function DraftHarness({
  item,
  onUpdated = vi.fn(),
  isOpen = true,
}: {
  item: KanbanItem
  onUpdated?: () => void
  isOpen?: boolean
}) {
  const draft = useItemDetailDraft({
    item,
    isOpen,
    projectPath: '/test/project',
    onUpdated,
  })

  return (
    <div>
      <input
        data-testid="title-input"
        value={draft.title}
        onChange={event => draft.setTitle(event.target.value)}
      />
      <textarea
        data-testid="description-input"
        value={draft.description}
        onChange={event => draft.setDescription(event.target.value)}
      />
      <select
        data-testid="provider-select"
        value={draft.agentProvider}
        onChange={event => draft.setAgentProvider(event.target.value as KanbanItem['agentProvider'])}
      >
        <option value="claude">Claude</option>
        <option value="codex">Codex</option>
        <option value="opencode">OpenCode</option>
      </select>
      <select
        data-testid="model-select"
        value={draft.model}
        onChange={event => draft.setModel(event.target.value)}
      >
        <option value="">Provider default</option>
        {(draft.providerModels[draft.agentProvider] || []).map(model => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
      <div data-testid="save-status">{draft.saveStatus}</div>
      <div data-testid="dirty">{String(draft.hasUnsavedChanges)}</div>
      <button data-testid="flush-manual" onClick={() => void draft.flushDraft('manual')}>
        Flush manual
      </button>
      <button data-testid="flush-close" onClick={() => void draft.flushDraft('close')}>
        Flush close
      </button>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateItem.mockResolvedValue(undefined)
  mockLoadConfig.mockResolvedValue({
    providerModels: {
      claude: ['claude-model'],
      codex: ['codex-model'],
      opencode: ['open-model'],
    },
  })

  Object.defineProperty(window, 'electronAPI', {
    value: {
      kanban: {
        updateItem: mockUpdateItem,
      },
      git: {
        loadConfig: mockLoadConfig,
      },
    },
    writable: true,
  })
})

describe('useItemDetailDraft', () => {
  it('should debounce rapid draft changes and call kanban.updateItem only once after 800ms', async () => {
    vi.useFakeTimers()
    try {
      render(<DraftHarness item={createMockItem()} />)

      fireEvent.change(screen.getByTestId('title-input'), { target: { value: 'A' } })
      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      fireEvent.change(screen.getByTestId('title-input'), { target: { value: 'AB' } })
      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      fireEvent.change(screen.getByTestId('title-input'), { target: { value: 'ABC' } })

      await act(async () => {
        vi.advanceTimersByTime(799)
      })
      expect(mockUpdateItem).not.toHaveBeenCalled()

      await act(async () => {
        vi.advanceTimersByTime(1)
      })

      expect(mockUpdateItem).toHaveBeenCalledTimes(1)
      expect(mockUpdateItem).toHaveBeenCalledWith('/test/project', 'item-1', expect.objectContaining({
        title: 'ABC',
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('should not auto-save when the title is blank or whitespace-only', async () => {
    vi.useFakeTimers()
    try {
      render(<DraftHarness item={createMockItem()} />)

      fireEvent.change(screen.getByTestId('title-input'), { target: { value: '   ' } })

      await act(async () => {
        vi.advanceTimersByTime(800)
      })

      expect(mockUpdateItem).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('should preserve unsaved input when the same item id receives a board refresh', () => {
    const item = createMockItem({ id: 'item-1', title: 'Server title' })

    const { rerender } = render(<DraftHarness item={item} />)

    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Local draft title' },
    })

    rerender(<DraftHarness item={{ ...item, title: 'Backend refresh title' }} />)

    expect(screen.getByTestId('title-input')).toHaveValue('Local draft title')
  })

  it('should reset the draft when a different item id is selected', () => {
    const { rerender } = render(<DraftHarness item={createMockItem({ id: 'item-1', title: 'First item' })} />)

    fireEvent.change(screen.getByTestId('title-input'), {
      target: { value: 'Unsaved local draft' },
    })

    rerender(<DraftHarness item={createMockItem({ id: 'item-2', title: 'Second item' })} />)

    expect(screen.getByTestId('title-input')).toHaveValue('Second item')
  })

  it('should clear the selected model when the chosen provider no longer offers that model', async () => {
    render(<DraftHarness item={createMockItem({ agentProvider: 'claude', model: 'claude-model' })} />)

    await waitFor(() => {
      expect(mockLoadConfig).toHaveBeenCalled()
    })

    fireEvent.change(screen.getByTestId('provider-select'), {
      target: { value: 'codex' },
    })

    await waitFor(() => {
      expect(screen.getByTestId('model-select')).toHaveValue('')
    })
  })

  it('should call onUpdated only for manual or close-triggered draft flushes, not for background autosave', async () => {
    vi.useFakeTimers()
    try {
      const onUpdated = vi.fn()
      render(<DraftHarness item={createMockItem()} onUpdated={onUpdated} />)

      fireEvent.change(screen.getByTestId('title-input'), { target: { value: 'Auto saved title' } })

      await act(async () => {
        vi.advanceTimersByTime(800)
      })

      expect(onUpdated).not.toHaveBeenCalled()

      fireEvent.change(screen.getByTestId('title-input'), { target: { value: 'Manual flush title' } })
      await act(async () => {
        fireEvent.click(screen.getByTestId('flush-manual'))
      })
      expect(onUpdated).toHaveBeenCalledTimes(1)

      fireEvent.change(screen.getByTestId('title-input'), { target: { value: 'Close flush title' } })
      await act(async () => {
        fireEvent.click(screen.getByTestId('flush-close'))
      })
      expect(onUpdated).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

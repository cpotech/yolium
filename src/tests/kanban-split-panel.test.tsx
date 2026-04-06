/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { KanbanView } from '@renderer/components/kanban/KanbanView'
import { ThemeProvider } from '@renderer/theme'
import type { KanbanBoard, KanbanItem } from '@shared/types/kanban'

// Mock the electronAPI
const mockKanbanGetBoard = vi.fn()
const mockOnKanbanBoardUpdated = vi.fn()
const mockDetectNestedRepos = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  mockDetectNestedRepos.mockResolvedValue({ isRepo: true, nestedRepos: [] })
  mockOnKanbanBoardUpdated.mockReturnValue(() => {})
  Object.defineProperty(window, 'electronAPI', {
    value: {
      kanban: {
        getBoard: mockKanbanGetBoard,
        onBoardUpdated: mockOnKanbanBoardUpdated,
        deleteItems: vi.fn().mockResolvedValue([]),
        addItem: vi.fn().mockResolvedValue({ id: 'new-1' }),
        updateItem: vi.fn().mockResolvedValue({}),
        deleteItem: vi.fn().mockResolvedValue({}),
      },
      dialog: {
        confirmOkCancel: vi.fn().mockResolvedValue(true),
      },
      git: {
        detectNestedRepos: mockDetectNestedRepos,
        init: vi.fn().mockResolvedValue({ success: true }),
        loadConfig: vi.fn().mockResolvedValue(null),
      },
      agent: {
        start: vi.fn().mockResolvedValue({ sessionId: 'session-1' }),
        resume: vi.fn().mockResolvedValue({ sessionId: 'session-1' }),
        recover: vi.fn().mockResolvedValue([]),
        listDefinitions: vi.fn().mockResolvedValue([]),
        readLog: vi.fn().mockResolvedValue(''),
        destroy: vi.fn().mockResolvedValue(() => {}),
        clearLog: vi.fn().mockResolvedValue(undefined),
        getActiveSession: vi.fn().mockResolvedValue(null),
        onOutput: vi.fn(() => () => {}),
        onProgress: vi.fn(() => () => {}),
        onComplete: vi.fn(() => () => {}),
        onError: vi.fn(() => () => {}),
        onExit: vi.fn(() => () => {}),
        onCostUpdate: vi.fn(() => () => {}),
      },
      app: {
        openExternal: vi.fn(),
      },
    },
    writable: true,
  })
})

const createMockItem = (overrides: Partial<KanbanItem> = {}): KanbanItem => ({
  id: 'test-1',
  title: 'Test Task Title',
  description: 'This is a test description',
  column: 'backlog',
  agentProvider: 'claude',
  agentStatus: 'idle',
  branch: undefined,
  order: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  comments: [],
  ...overrides,
})

const createMockBoard = (items: KanbanItem[] = []): KanbanBoard => ({
  id: 'board-1',
  projectPath: '/test/project',
  items,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
})

async function renderAndWaitForBoard(items: KanbanItem[] = []) {
  const board = createMockBoard(items)
  mockKanbanGetBoard.mockResolvedValue(board)
  render(<KanbanView projectPath="/test/project" />)
  await waitFor(() => {
    expect(screen.queryByTestId('kanban-loading')).not.toBeInTheDocument()
  })
}

describe('Kanban Split Panel', () => {
  it('should render kanban columns without detail panel when no item is selected', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Task A', column: 'backlog' }),
      createMockItem({ id: '2', title: 'Task B', column: 'ready' }),
    ]
    await renderAndWaitForBoard(items)

    // Columns should be visible
    expect(screen.getByTestId('kanban-columns-container')).toBeInTheDocument()
    expect(screen.getByTestId('kanban-column-backlog')).toBeInTheDocument()
    expect(screen.getByTestId('kanban-column-ready')).toBeInTheDocument()

    // Detail panel should NOT be present
    expect(screen.queryByTestId('item-detail-dialog')).not.toBeInTheDocument()
  })

  it('should render detail panel alongside columns when an item is selected', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Task A', column: 'backlog' }),
    ]
    await renderAndWaitForBoard(items)

    // Click the card to open detail panel
    const card = screen.getByText('Task A')
    await act(async () => {
      fireEvent.click(card)
    })

    // Both columns and detail panel should be visible
    expect(screen.getByTestId('kanban-columns-container')).toBeInTheDocument()
    expect(screen.getByTestId('item-detail-dialog')).toBeInTheDocument()
  })

  it('should apply split layout classes (flex row) when detail panel is open', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Task A', column: 'backlog' }),
    ]
    await renderAndWaitForBoard(items)

    // Click card to open panel
    const card = screen.getByText('Task A')
    await act(async () => {
      fireEvent.click(card)
    })

    // The split container should exist with flex layout
    const splitContainer = screen.getByTestId('kanban-split-container')
    expect(splitContainer).toBeInTheDocument()
    expect(splitContainer.className).toContain('flex')
  })

  it('should close detail panel and restore full board when Escape/Ctrl+Q is pressed', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Task A', column: 'backlog' }),
    ]
    await renderAndWaitForBoard(items)

    // Open the panel
    const card = screen.getByText('Task A')
    await act(async () => {
      fireEvent.click(card)
    })
    expect(screen.getByTestId('item-detail-dialog')).toBeInTheDocument()

    // Press Ctrl+Q to close
    const dialog = screen.getByTestId('item-detail-dialog')
    await act(async () => {
      fireEvent.keyDown(dialog.closest('[tabindex="-1"]')!, { key: 'q', ctrlKey: true })
    })

    // Panel should be gone, columns should still be there
    await waitFor(() => {
      expect(screen.queryByTestId('item-detail-dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('kanban-columns-container')).toBeInTheDocument()
  })

  it('should switch to a different item when clicking another card while panel is open', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Task A', column: 'backlog' }),
      createMockItem({ id: '2', title: 'Task B', column: 'backlog' }),
    ]
    await renderAndWaitForBoard(items)

    // Open first item
    const cardA = screen.getByText('Task A')
    await act(async () => {
      fireEvent.click(cardA)
    })
    expect(screen.getByTestId('item-detail-dialog')).toBeInTheDocument()

    // Click second item while panel is open
    const cardB = screen.getByText('Task B')
    await act(async () => {
      fireEvent.click(cardB)
    })

    // Panel should still be open (switched to Task B)
    expect(screen.getByTestId('item-detail-dialog')).toBeInTheDocument()
  })

  it('should keep kanban board interactive (clickable cards) while panel is open', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Task A', column: 'backlog' }),
      createMockItem({ id: '2', title: 'Task B', column: 'ready' }),
    ]
    await renderAndWaitForBoard(items)

    // Open first item
    const cardA = screen.getByText('Task A')
    await act(async () => {
      fireEvent.click(cardA)
    })

    // Board columns should still be visible and contain cards
    expect(screen.getByTestId('kanban-column-backlog')).toBeInTheDocument()
    expect(screen.getByTestId('kanban-column-ready')).toBeInTheDocument()

    // Cards should still be in the DOM and clickable
    const cards = screen.getAllByTestId('kanban-card')
    expect(cards.length).toBeGreaterThanOrEqual(2)
  })

  it('should open a second item in a new tab without closing the first', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Task A', column: 'backlog' }),
      createMockItem({ id: '2', title: 'Task B', column: 'backlog' }),
    ]
    await renderAndWaitForBoard(items)

    const cards = screen.getAllByTestId('kanban-card')

    // Open first item
    await act(async () => {
      fireEvent.click(cards[0])
    })
    expect(screen.getByTestId('item-detail-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('detail-panel-tab-bar')).toBeInTheDocument()

    // Open second item — first should remain as a tab
    await act(async () => {
      fireEvent.click(cards[1])
    })
    expect(screen.getByTestId('item-detail-dialog')).toBeInTheDocument()
    const tabs = screen.getAllByTestId('detail-tab')
    expect(tabs).toHaveLength(2)
  })

  it('should switch to existing tab when clicking an already-open item', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Task A', column: 'backlog' }),
      createMockItem({ id: '2', title: 'Task B', column: 'backlog' }),
    ]
    await renderAndWaitForBoard(items)

    // Open both items by clicking kanban cards
    const cards = screen.getAllByTestId('kanban-card')
    await act(async () => { fireEvent.click(cards[0]) }) // Task A
    await act(async () => { fireEvent.click(cards[1]) }) // Task B

    // Click Task A card again — should switch to it, not create duplicate
    await act(async () => { fireEvent.click(cards[0]) })

    const tabs = screen.getAllByTestId('detail-tab')
    expect(tabs).toHaveLength(2) // still 2, no duplicate
    // Task A tab should be active
    const activeTab = tabs.find(t => t.getAttribute('data-active') === 'true')
    expect(activeTab).toBeTruthy()
    expect(activeTab!.textContent).toContain('Task A')
  })

  it('should close active tab and switch to next tab', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Task A', column: 'backlog' }),
      createMockItem({ id: '2', title: 'Task B', column: 'backlog' }),
      createMockItem({ id: '3', title: 'Task C', column: 'backlog' }),
    ]
    await renderAndWaitForBoard(items)

    const cards = screen.getAllByTestId('kanban-card')
    // Open all three items
    await act(async () => { fireEvent.click(cards[0]) })
    await act(async () => { fireEvent.click(cards[1]) })
    await act(async () => { fireEvent.click(cards[2]) })

    // Switch to Task B (middle tab)
    const tabB = screen.getAllByTestId('detail-tab').find(t => t.textContent?.includes('Task B'))!
    await act(async () => { fireEvent.click(tabB) })

    // Close Task B via its close button
    const closeBtn = tabB.querySelector('[data-testid="detail-tab-close"]')!
    await act(async () => { fireEvent.click(closeBtn) })

    // Should switch to next tab (Task C)
    const remainingTabs = screen.getAllByTestId('detail-tab')
    expect(remainingTabs).toHaveLength(2)
    const activeTab = remainingTabs.find(t => t.getAttribute('data-active') === 'true')
    expect(activeTab!.textContent).toContain('Task C')
  })

  it('should close active tab and switch to previous tab when no next tab exists', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Task A', column: 'backlog' }),
      createMockItem({ id: '2', title: 'Task B', column: 'backlog' }),
    ]
    await renderAndWaitForBoard(items)

    const cards = screen.getAllByTestId('kanban-card')
    // Open both items — Task B is active (last opened)
    await act(async () => { fireEvent.click(cards[0]) })
    await act(async () => { fireEvent.click(cards[1]) })

    // Close Task B (last tab, no next)
    const tabB = screen.getAllByTestId('detail-tab').find(t => t.textContent?.includes('Task B'))!
    const closeBtn = tabB.querySelector('[data-testid="detail-tab-close"]')!
    await act(async () => { fireEvent.click(closeBtn) })

    // Should switch to previous tab (Task A)
    const remainingTabs = screen.getAllByTestId('detail-tab')
    expect(remainingTabs).toHaveLength(1)
    const activeTab = remainingTabs.find(t => t.getAttribute('data-active') === 'true')
    expect(activeTab!.textContent).toContain('Task A')
  })

  it('should close all tabs when last tab is closed', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Task A', column: 'backlog' }),
    ]
    await renderAndWaitForBoard(items)

    // Open single item
    await act(async () => { fireEvent.click(screen.getByText('Task A')) })
    expect(screen.getByTestId('detail-panel-tab-bar')).toBeInTheDocument()

    // Close it
    const tab = screen.getByTestId('detail-tab')
    const closeBtn = tab.querySelector('[data-testid="detail-tab-close"]')!
    await act(async () => { fireEvent.click(closeBtn) })

    // Panel and tab bar should be gone
    expect(screen.queryByTestId('item-detail-dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('detail-panel-tab-bar')).not.toBeInTheDocument()
  })

  it('should sync all open items when board refreshes', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Task A', column: 'backlog' }),
      createMockItem({ id: '2', title: 'Task B', column: 'backlog' }),
    ]
    await renderAndWaitForBoard(items)

    const cards = screen.getAllByTestId('kanban-card')
    // Open both items
    await act(async () => { fireEvent.click(cards[0]) })
    await act(async () => { fireEvent.click(cards[1]) })

    // Simulate board refresh with updated titles
    const updatedItems = [
      createMockItem({ id: '1', title: 'Task A Updated', column: 'backlog' }),
      createMockItem({ id: '2', title: 'Task B Updated', column: 'backlog' }),
    ]
    mockKanbanGetBoard.mockResolvedValue(createMockBoard(updatedItems))

    // Trigger refresh
    await act(async () => {
      fireEvent.click(screen.getByTestId('refresh-button'))
    })

    // Wait for both tab titles to update
    await waitFor(() => {
      const tabs = screen.getAllByTestId('detail-tab')
      expect(tabs).toHaveLength(2)
      expect(tabs.some(t => t.textContent?.includes('Task A Updated'))).toBe(true)
      expect(tabs.some(t => t.textContent?.includes('Task B Updated'))).toBe(true)
    })
  })

  it('should remove tab when item is deleted from board', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Task A', column: 'backlog' }),
      createMockItem({ id: '2', title: 'Task B', column: 'backlog' }),
    ]
    await renderAndWaitForBoard(items)

    const cards = screen.getAllByTestId('kanban-card')
    // Open both items
    await act(async () => { fireEvent.click(cards[0]) })
    await act(async () => { fireEvent.click(cards[1]) })

    // Simulate board refresh with Task A removed
    const updatedItems = [
      createMockItem({ id: '2', title: 'Task B', column: 'backlog' }),
    ]
    mockKanbanGetBoard.mockResolvedValue(createMockBoard(updatedItems))

    await act(async () => {
      fireEvent.click(screen.getByTestId('refresh-button'))
    })

    await waitFor(() => {
      const tabs = screen.getAllByTestId('detail-tab')
      expect(tabs).toHaveLength(1)
      expect(tabs[0].textContent).toContain('Task B')
    })
  })

  it('should show open-in-tab indicator on cards with background tabs', async () => {
    const items = [
      createMockItem({ id: '1', title: 'Task A', column: 'backlog' }),
      createMockItem({ id: '2', title: 'Task B', column: 'backlog' }),
    ]
    await renderAndWaitForBoard(items)

    const cards = screen.getAllByTestId('kanban-card')
    // Open both items — Task B is active
    await act(async () => { fireEvent.click(cards[0]) })
    await act(async () => { fireEvent.click(cards[1]) })

    // Task A's card should have the open-in-tab indicator (it's a background tab)
    const updatedCards = screen.getAllByTestId('kanban-card')
    const taskACard = updatedCards.find(c => c.textContent?.includes('Task A'))!
    expect(taskACard.getAttribute('data-open-in-tab')).toBe('true')
  })
})

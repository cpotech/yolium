import { describe, it, expect } from 'vitest'
import type { Tab, TabState, TabAction, ContainerState } from '@shared/types/tabs'

// Extract the reducer logic for testing
// (In production, you'd export this from useTabState.ts)
function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case 'ADD_TAB':
      return {
        tabs: [...state.tabs, action.payload],
        activeTabId: action.payload.id,
      }

    case 'CLOSE_TAB': {
      const closedIndex = state.tabs.findIndex(t => t.id === action.payload)
      const newTabs = state.tabs.filter(t => t.id !== action.payload)
      let newActiveId = state.activeTabId
      if (state.activeTabId === action.payload) {
        newActiveId = newTabs[closedIndex]?.id || newTabs[closedIndex - 1]?.id || null
      }
      return { tabs: newTabs, activeTabId: newActiveId }
    }

    case 'SET_ACTIVE':
      return { ...state, activeTabId: action.payload }

    case 'UPDATE_CWD': {
      const { id, cwd } = action.payload
      const label = cwd.split('/').pop() || cwd
      return {
        ...state,
        tabs: state.tabs.map(t => t.id === id ? { ...t, cwd, label } : t),
      }
    }

    case 'UPDATE_CONTAINER_STATE': {
      const { id, state: containerState } = action.payload
      return {
        ...state,
        tabs: state.tabs.map(t => t.id === id ? { ...t, containerState } : t),
      }
    }

    case 'REORDER_TABS': {
      const { fromIndex, toIndex } = action.payload
      const newTabs = [...state.tabs]
      const [movedTab] = newTabs.splice(fromIndex, 1)
      newTabs.splice(toIndex, 0, movedTab)
      return { ...state, tabs: newTabs }
    }

    case 'RESTORE_SESSION':
      return action.payload

    case 'CLOSE_ALL_TABS':
      return { tabs: [], activeTabId: null }

    case 'CLOSE_OTHER_TABS': {
      const keepTab = state.tabs.find(t => t.id === action.payload)
      return {
        tabs: keepTab ? [keepTab] : [],
        activeTabId: action.payload,
      }
    }

    case 'UPDATE_GIT_BRANCH': {
      const { id, gitBranch, worktreeName } = action.payload
      return {
        ...state,
        tabs: state.tabs.map(t => t.id === id ? { ...t, gitBranch, worktreeName } : t),
      }
    }

    default:
      return state
  }
}

// Helper to create a test tab
function createTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: `tab-${Date.now()}`,
    type: 'terminal',
    sessionId: 'session-1',
    cwd: '/home/user/project',
    label: 'project',
    containerState: 'running',
    ...overrides,
  }
}

describe('tabReducer', () => {
  const emptyState: TabState = { tabs: [], activeTabId: null }

  describe('ADD_TAB', () => {
    it('adds a tab to empty state', () => {
      const tab = createTab({ id: 'tab-1' })
      const result = tabReducer(emptyState, { type: 'ADD_TAB', payload: tab })

      expect(result.tabs).toHaveLength(1)
      expect(result.tabs[0]).toBe(tab)
      expect(result.activeTabId).toBe('tab-1')
    })

    it('appends tab to existing tabs', () => {
      const state: TabState = {
        tabs: [createTab({ id: 'tab-1' })],
        activeTabId: 'tab-1',
      }
      const newTab = createTab({ id: 'tab-2' })
      const result = tabReducer(state, { type: 'ADD_TAB', payload: newTab })

      expect(result.tabs).toHaveLength(2)
      expect(result.activeTabId).toBe('tab-2')
    })
  })

  describe('CLOSE_TAB', () => {
    it('removes tab and activates next tab', () => {
      const state: TabState = {
        tabs: [createTab({ id: 'tab-1' }), createTab({ id: 'tab-2' })],
        activeTabId: 'tab-1',
      }
      const result = tabReducer(state, { type: 'CLOSE_TAB', payload: 'tab-1' })

      expect(result.tabs).toHaveLength(1)
      expect(result.activeTabId).toBe('tab-2')
    })

    it('activates previous tab when closing last tab', () => {
      const state: TabState = {
        tabs: [createTab({ id: 'tab-1' }), createTab({ id: 'tab-2' })],
        activeTabId: 'tab-2',
      }
      const result = tabReducer(state, { type: 'CLOSE_TAB', payload: 'tab-2' })

      expect(result.tabs).toHaveLength(1)
      expect(result.activeTabId).toBe('tab-1')
    })

    it('sets activeTabId to null when closing only tab', () => {
      const state: TabState = {
        tabs: [createTab({ id: 'tab-1' })],
        activeTabId: 'tab-1',
      }
      const result = tabReducer(state, { type: 'CLOSE_TAB', payload: 'tab-1' })

      expect(result.tabs).toHaveLength(0)
      expect(result.activeTabId).toBeNull()
    })

    it('preserves active tab when closing non-active tab', () => {
      const state: TabState = {
        tabs: [createTab({ id: 'tab-1' }), createTab({ id: 'tab-2' })],
        activeTabId: 'tab-1',
      }
      const result = tabReducer(state, { type: 'CLOSE_TAB', payload: 'tab-2' })

      expect(result.activeTabId).toBe('tab-1')
    })
  })

  describe('SET_ACTIVE', () => {
    it('changes active tab', () => {
      const state: TabState = {
        tabs: [createTab({ id: 'tab-1' }), createTab({ id: 'tab-2' })],
        activeTabId: 'tab-1',
      }
      const result = tabReducer(state, { type: 'SET_ACTIVE', payload: 'tab-2' })

      expect(result.activeTabId).toBe('tab-2')
    })
  })

  describe('UPDATE_CWD', () => {
    it('updates cwd and label for tab', () => {
      const state: TabState = {
        tabs: [createTab({ id: 'tab-1', cwd: '/old/path', label: 'path' })],
        activeTabId: 'tab-1',
      }
      const result = tabReducer(state, {
        type: 'UPDATE_CWD',
        payload: { id: 'tab-1', cwd: '/new/folder' },
      })

      expect(result.tabs[0].cwd).toBe('/new/folder')
      expect(result.tabs[0].label).toBe('folder')
    })
  })

  describe('UPDATE_CONTAINER_STATE', () => {
    it('updates container state for tab', () => {
      const state: TabState = {
        tabs: [createTab({ id: 'tab-1', containerState: 'starting' })],
        activeTabId: 'tab-1',
      }
      const result = tabReducer(state, {
        type: 'UPDATE_CONTAINER_STATE',
        payload: { id: 'tab-1', state: 'running' },
      })

      expect(result.tabs[0].containerState).toBe('running')
    })
  })

  describe('REORDER_TABS', () => {
    it('moves tab from one position to another', () => {
      const state: TabState = {
        tabs: [
          createTab({ id: 'tab-1' }),
          createTab({ id: 'tab-2' }),
          createTab({ id: 'tab-3' }),
        ],
        activeTabId: 'tab-1',
      }
      const result = tabReducer(state, {
        type: 'REORDER_TABS',
        payload: { fromIndex: 0, toIndex: 2 },
      })

      expect(result.tabs[0].id).toBe('tab-2')
      expect(result.tabs[1].id).toBe('tab-3')
      expect(result.tabs[2].id).toBe('tab-1')
    })
  })

  describe('RESTORE_SESSION', () => {
    it('replaces entire state', () => {
      const newState: TabState = {
        tabs: [createTab({ id: 'restored-1' })],
        activeTabId: 'restored-1',
      }
      const result = tabReducer(emptyState, {
        type: 'RESTORE_SESSION',
        payload: newState,
      })

      expect(result).toBe(newState)
    })
  })

  describe('CLOSE_ALL_TABS', () => {
    it('removes all tabs', () => {
      const state: TabState = {
        tabs: [createTab({ id: 'tab-1' }), createTab({ id: 'tab-2' })],
        activeTabId: 'tab-1',
      }
      const result = tabReducer(state, { type: 'CLOSE_ALL_TABS' })

      expect(result.tabs).toHaveLength(0)
      expect(result.activeTabId).toBeNull()
    })
  })

  describe('CLOSE_OTHER_TABS', () => {
    it('keeps only the specified tab', () => {
      const state: TabState = {
        tabs: [
          createTab({ id: 'tab-1' }),
          createTab({ id: 'tab-2' }),
          createTab({ id: 'tab-3' }),
        ],
        activeTabId: 'tab-1',
      }
      const result = tabReducer(state, {
        type: 'CLOSE_OTHER_TABS',
        payload: 'tab-2',
      })

      expect(result.tabs).toHaveLength(1)
      expect(result.tabs[0].id).toBe('tab-2')
      expect(result.activeTabId).toBe('tab-2')
    })
  })

  describe('UPDATE_GIT_BRANCH', () => {
    it('updates git branch and worktree name', () => {
      const state: TabState = {
        tabs: [createTab({ id: 'tab-1' })],
        activeTabId: 'tab-1',
      }
      const result = tabReducer(state, {
        type: 'UPDATE_GIT_BRANCH',
        payload: { id: 'tab-1', gitBranch: 'main', worktreeName: 'yolium-123' },
      })

      expect(result.tabs[0].gitBranch).toBe('main')
      expect(result.tabs[0].worktreeName).toBe('yolium-123')
    })
  })
})

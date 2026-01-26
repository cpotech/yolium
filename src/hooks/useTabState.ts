import { useReducer, useCallback } from 'react';
import type { Tab, TabState, TabAction, ContainerState } from '../types/tabs';

const initialState: TabState = {
  tabs: [],
  activeTabId: null,
};

function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case 'ADD_TAB':
      return {
        tabs: [...state.tabs, action.payload],
        activeTabId: action.payload.id,  // New tab becomes active
      };

    case 'CLOSE_TAB': {
      const closedIndex = state.tabs.findIndex(t => t.id === action.payload);
      const newTabs = state.tabs.filter(t => t.id !== action.payload);

      // Determine new active tab
      let newActiveId = state.activeTabId;
      if (state.activeTabId === action.payload) {
        // Activate adjacent tab (prefer right, then left)
        newActiveId = newTabs[closedIndex]?.id || newTabs[closedIndex - 1]?.id || null;
      }

      return { tabs: newTabs, activeTabId: newActiveId };
    }

    case 'SET_ACTIVE':
      return { ...state, activeTabId: action.payload };

    case 'UPDATE_CWD': {
      const { id, cwd } = action.payload;
      // Extract folder name from path for label
      const label = cwd.split('/').pop() || cwd;
      return {
        ...state,
        tabs: state.tabs.map(t => t.id === id ? { ...t, cwd, label } : t),
      };
    }

    case 'UPDATE_CONTAINER_STATE': {
      const { id, state: containerState } = action.payload;
      return {
        ...state,
        tabs: state.tabs.map(t => t.id === id ? { ...t, containerState } : t),
      };
    }

    case 'REORDER_TABS': {
      const { fromIndex, toIndex } = action.payload;
      const newTabs = [...state.tabs];
      const [movedTab] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, movedTab);
      return { ...state, tabs: newTabs };
    }

    case 'RESTORE_SESSION':
      return action.payload;

    case 'CLOSE_ALL_TABS':
      return { tabs: [], activeTabId: null };

    case 'CLOSE_OTHER_TABS': {
      const keepTab = state.tabs.find(t => t.id === action.payload);
      return {
        tabs: keepTab ? [keepTab] : [],
        activeTabId: action.payload,
      };
    }

    case 'UPDATE_GIT_BRANCH': {
      const { id, gitBranch, worktreeName } = action.payload;
      return {
        ...state,
        tabs: state.tabs.map(t => t.id === id ? { ...t, gitBranch, worktreeName } : t),
      };
    }

    default:
      return state;
  }
}

// Generate unique tab ID
function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useTabState() {
  const [state, dispatch] = useReducer(tabReducer, initialState);

  const addTab = useCallback((sessionId: string, cwd: string, containerState: ContainerState = 'starting', gitBranch?: string) => {
    const label = cwd.split('/').pop() || cwd;
    const tab: Tab = {
      id: generateTabId(),
      sessionId,
      cwd,
      label,
      containerState,
      gitBranch,
    };
    dispatch({ type: 'ADD_TAB', payload: tab });
    return tab.id;
  }, []);

  const closeTab = useCallback((tabId: string) => {
    dispatch({ type: 'CLOSE_TAB', payload: tabId });
  }, []);

  const setActiveTab = useCallback((tabId: string) => {
    dispatch({ type: 'SET_ACTIVE', payload: tabId });
  }, []);

  const updateCwd = useCallback((tabId: string, cwd: string) => {
    dispatch({ type: 'UPDATE_CWD', payload: { id: tabId, cwd } });
  }, []);

  const updateContainerState = useCallback((tabId: string, containerState: ContainerState) => {
    dispatch({ type: 'UPDATE_CONTAINER_STATE', payload: { id: tabId, state: containerState } });
  }, []);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    dispatch({ type: 'REORDER_TABS', payload: { fromIndex, toIndex } });
  }, []);

  const restoreSession = useCallback((savedState: TabState) => {
    dispatch({ type: 'RESTORE_SESSION', payload: savedState });
  }, []);

  const closeAllTabs = useCallback(() => {
    dispatch({ type: 'CLOSE_ALL_TABS' });
  }, []);

  const closeOtherTabs = useCallback((tabId: string) => {
    dispatch({ type: 'CLOSE_OTHER_TABS', payload: tabId });
  }, []);

  const updateGitBranch = useCallback((tabId: string, gitBranch: string | undefined, worktreeName?: string) => {
    dispatch({ type: 'UPDATE_GIT_BRANCH', payload: { id: tabId, gitBranch, worktreeName } });
  }, []);

  // Helper to get active tab
  const activeTab = state.tabs.find(t => t.id === state.activeTabId) || null;

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab,
    addTab,
    closeTab,
    setActiveTab,
    updateCwd,
    updateContainerState,
    updateGitBranch,
    reorderTabs,
    restoreSession,
    closeAllTabs,
    closeOtherTabs,
  };
}

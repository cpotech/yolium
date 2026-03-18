import { useReducer, useCallback } from 'react';
import type { Tab, TabState, TabAction, ContainerState, TabType } from '@shared/types/tabs';
import { getFolderName } from '@renderer/lib/path-utils';

// Generate unique tab ID
function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case 'ADD_TAB':
      return {
        tabs: [...state.tabs, action.payload],
        activeTabId: action.payload.id,  // New tab becomes active
      };

    case 'ADD_KANBAN_TAB': {
      const { cwd } = action.payload;
      // Check if kanban tab already exists for this project
      const existingKanban = state.tabs.find(
        t => t.type === 'kanban' && t.cwd === cwd
      );
      if (existingKanban) {
        // Just activate the existing tab
        return { ...state, activeTabId: existingKanban.id };
      }
      // Create new kanban tab
      const label = getFolderName(cwd);
      const newTab: Tab = {
        id: generateTabId(),
        type: 'kanban',
        cwd,
        label,
      };
      return {
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
      };
    }

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
      const label = getFolderName(cwd);
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

    case 'ADD_SCHEDULE_TAB': {
      const existingSchedule = state.tabs.find(t => t.type === 'schedule');
      if (existingSchedule) {
        return { ...state, activeTabId: existingSchedule.id };
      }
      const scheduleTab: Tab = {
        id: generateTabId(),
        type: 'schedule',
        cwd: '',
        label: 'Scheduled Agents',
      };
      return {
        tabs: [...state.tabs, scheduleTab],
        activeTabId: scheduleTab.id,
      };
    }

    case 'CLOSE_KANBAN_FOR_PROJECT': {
      const projectPath = action.payload;
      const kanbanTab = state.tabs.find(
        t => t.type === 'kanban' && t.cwd === projectPath
      );
      if (!kanbanTab) return state;

      // Reuse CLOSE_TAB logic
      const closedIndex = state.tabs.findIndex(t => t.id === kanbanTab.id);
      const newTabs = state.tabs.filter(t => t.id !== kanbanTab.id);
      let newActiveId = state.activeTabId;
      if (state.activeTabId === kanbanTab.id) {
        newActiveId = newTabs[closedIndex]?.id || newTabs[closedIndex - 1]?.id || null;
      }
      return { tabs: newTabs, activeTabId: newActiveId };
    }

    default:
      return state;
  }
}

function buildInitialState(kanbanPaths?: string[]): TabState {
  if (!kanbanPaths || kanbanPaths.length === 0) {
    return { tabs: [], activeTabId: null };
  }
  const tabs: Tab[] = kanbanPaths.map(cwd => ({
    id: generateTabId(),
    type: 'kanban' as TabType,
    cwd,
    label: getFolderName(cwd),
  }));
  return { tabs, activeTabId: tabs[0]?.id ?? null };
}

export function useTabState(initialKanbanPaths?: string[]) {
  const [state, dispatch] = useReducer(tabReducer, initialKanbanPaths, buildInitialState);

  const addTab = useCallback((sessionId: string, cwd: string, containerState: ContainerState = 'starting', gitBranch?: string) => {
    const label = getFolderName(cwd);
    const tab: Tab = {
      id: generateTabId(),
      type: 'terminal',
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

  const addKanbanTab = useCallback((cwd: string) => {
    dispatch({ type: 'ADD_KANBAN_TAB', payload: { cwd } });
  }, []);

  const closeKanbanForProject = useCallback((projectPath: string) => {
    dispatch({ type: 'CLOSE_KANBAN_FOR_PROJECT', payload: projectPath });
  }, []);

  const addScheduleTab = useCallback(() => {
    dispatch({ type: 'ADD_SCHEDULE_TAB' });
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
    addKanbanTab,
    closeKanbanForProject,
    addScheduleTab,
  };
}

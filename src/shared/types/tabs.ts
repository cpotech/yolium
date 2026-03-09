// Container lifecycle state
export type ContainerState = 'starting' | 'running' | 'stopped' | 'crashed';

// Tab type discriminator
export type TabType = 'terminal' | 'kanban' | 'schedule';

// Tab represents a single tab (terminal or kanban)
export interface Tab {
  id: string;                     // Unique tab identifier
  type: TabType;                  // Tab type discriminator
  cwd: string;                    // Project path
  label: string;                  // Display label (folder name from cwd)

  // Terminal-specific fields (only present when type === 'terminal')
  sessionId?: string;             // Container session ID from docker-manager
  containerState?: ContainerState; // Container lifecycle state
  gitBranch?: string;             // Git branch name (if in a git repo)
  worktreeName?: string;          // Worktree name (e.g., "yolium-1769209493620")
}

// State shape for useReducer
export interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
}

// Actions for tab state management
export type TabAction =
  | { type: 'ADD_TAB'; payload: Tab }
  | { type: 'ADD_KANBAN_TAB'; payload: { cwd: string } }
  | { type: 'CLOSE_TAB'; payload: string }
  | { type: 'SET_ACTIVE'; payload: string }
  | { type: 'UPDATE_CWD'; payload: { id: string; cwd: string } }
  | { type: 'UPDATE_CONTAINER_STATE'; payload: { id: string; state: ContainerState } }
  | { type: 'UPDATE_GIT_BRANCH'; payload: { id: string; gitBranch: string | undefined; worktreeName?: string } }
  | { type: 'REORDER_TABS'; payload: { fromIndex: number; toIndex: number } }
  | { type: 'RESTORE_SESSION'; payload: TabState }
  | { type: 'CLOSE_ALL_TABS' }
  | { type: 'CLOSE_OTHER_TABS'; payload: string }
  | { type: 'CLOSE_KANBAN_FOR_PROJECT'; payload: string }
  | { type: 'ADD_SCHEDULE_TAB' };

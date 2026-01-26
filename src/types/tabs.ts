// Container lifecycle state
export type ContainerState = 'starting' | 'running' | 'stopped' | 'crashed';

// Split direction for tab splits
export type SplitDirection = 'horizontal' | 'vertical' | null;

// Tab represents a single terminal tab
export interface Tab {
  id: string;                    // Unique tab identifier
  sessionId: string;             // Container session ID from docker-manager
  cwd: string;                   // Current working directory (folder path selected)
  label: string;                 // Display label (folder name from cwd)
  containerState: ContainerState; // Container lifecycle state
  gitBranch?: string;            // Git branch name (if in a git repo)
  worktreeName?: string;         // Worktree name (e.g., "yolium-1769209493620")
}

// State shape for useReducer
export interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
  splitDirection: SplitDirection;
  splitTabId: string | null;  // The tab ID shown in the split pane
}

// Actions for tab state management
export type TabAction =
  | { type: 'ADD_TAB'; payload: Tab }
  | { type: 'CLOSE_TAB'; payload: string }  // payload is tab id
  | { type: 'SET_ACTIVE'; payload: string }  // payload is tab id
  | { type: 'UPDATE_CWD'; payload: { id: string; cwd: string } }
  | { type: 'UPDATE_CONTAINER_STATE'; payload: { id: string; state: ContainerState } }
  | { type: 'UPDATE_GIT_BRANCH'; payload: { id: string; gitBranch: string | undefined; worktreeName?: string } }
  | { type: 'REORDER_TABS'; payload: { fromIndex: number; toIndex: number } }
  | { type: 'RESTORE_SESSION'; payload: TabState }
  | { type: 'CLOSE_ALL_TABS' }
  | { type: 'CLOSE_OTHER_TABS'; payload: string }  // payload is tab id to keep
  | { type: 'SPLIT_HORIZONTAL' }
  | { type: 'SPLIT_VERTICAL' }
  | { type: 'UNSPLIT' };

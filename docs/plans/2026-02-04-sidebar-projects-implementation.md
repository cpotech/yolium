# Sidebar Projects Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the sidebar from a view toggle into a project list where each project can open its own kanban tab.

**Architecture:** Replace the current Terminal/Kanban view toggle with a collapsible project list. Projects are stored in localStorage and auto-added when terminals are created. Clicking a project opens a kanban tab (single instance per project). The tab system gains a `type` field to distinguish terminal vs kanban tabs.

**Tech Stack:** React, TypeScript, localStorage, Lucide icons

---

## Task 1: Create Sidebar Project Store

**Files:**
- Create: `src/lib/sidebar-store.ts`
- Test: `src/tests/sidebar-store.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tests/sidebar-store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSidebarProjects,
  addSidebarProject,
  removeSidebarProject,
  clearSidebarProjects,
} from '../lib/sidebar-store';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('sidebar-store', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('getSidebarProjects', () => {
    it('returns empty array when no projects stored', () => {
      const projects = getSidebarProjects();
      expect(projects).toEqual([]);
    });

    it('returns stored projects', () => {
      const data = [{ path: '/home/user/project1', addedAt: '2026-02-04T00:00:00.000Z' }];
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(data));

      const projects = getSidebarProjects();
      expect(projects).toEqual(data);
    });
  });

  describe('addSidebarProject', () => {
    it('adds a new project', () => {
      addSidebarProject('/home/user/project1');

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      expect(savedData).toHaveLength(1);
      expect(savedData[0].path).toBe('/home/user/project1');
      expect(savedData[0].addedAt).toBeDefined();
    });

    it('does not add duplicate projects', () => {
      const existing = [{ path: '/home/user/project1', addedAt: '2026-02-04T00:00:00.000Z' }];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(existing));

      addSidebarProject('/home/user/project1');

      // Should not call setItem since project already exists
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });
  });

  describe('removeSidebarProject', () => {
    it('removes an existing project', () => {
      const existing = [
        { path: '/home/user/project1', addedAt: '2026-02-04T00:00:00.000Z' },
        { path: '/home/user/project2', addedAt: '2026-02-04T00:00:00.000Z' },
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(existing));

      removeSidebarProject('/home/user/project1');

      const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      expect(savedData).toHaveLength(1);
      expect(savedData[0].path).toBe('/home/user/project2');
    });
  });

  describe('clearSidebarProjects', () => {
    it('removes all projects', () => {
      clearSidebarProjects();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('yolium-sidebar-projects');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/tests/sidebar-store.test.ts`
Expected: FAIL with "Cannot find module '../lib/sidebar-store'"

**Step 3: Write minimal implementation**

```typescript
// src/lib/sidebar-store.ts
export interface SidebarProject {
  path: string;
  addedAt: string;
}

const STORAGE_KEY = 'yolium-sidebar-projects';

export function getSidebarProjects(): SidebarProject[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const projects = JSON.parse(stored) as SidebarProject[];
    if (!Array.isArray(projects)) return [];
    return projects;
  } catch {
    return [];
  }
}

export function addSidebarProject(path: string): void {
  const projects = getSidebarProjects();
  // Don't add duplicates
  if (projects.some(p => p.path === path)) return;

  projects.push({
    path,
    addedAt: new Date().toISOString(),
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function removeSidebarProject(path: string): void {
  const projects = getSidebarProjects();
  const filtered = projects.filter(p => p.path !== path);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function clearSidebarProjects(): void {
  localStorage.removeItem(STORAGE_KEY);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/tests/sidebar-store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/sidebar-store.ts src/tests/sidebar-store.test.ts
git commit -m "feat: add sidebar project store for localStorage persistence"
```

---

## Task 2: Update Tab Types for Kanban Tabs

**Files:**
- Modify: `src/types/tabs.ts`
- Modify: `src/hooks/useTabState.ts`
- Test: `src/tests/useTabState.test.ts`

**Step 1: Update Tab interface**

In `src/types/tabs.ts`, add `type` field and make terminal-specific fields optional:

```typescript
// src/types/tabs.ts

// Container lifecycle state
export type ContainerState = 'starting' | 'running' | 'stopped' | 'crashed';

// Tab type discriminator
export type TabType = 'terminal' | 'kanban';

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
  | { type: 'CLOSE_TAB'; payload: string }  // payload is tab id
  | { type: 'SET_ACTIVE'; payload: string }  // payload is tab id
  | { type: 'UPDATE_CWD'; payload: { id: string; cwd: string } }
  | { type: 'UPDATE_CONTAINER_STATE'; payload: { id: string; state: ContainerState } }
  | { type: 'UPDATE_GIT_BRANCH'; payload: { id: string; gitBranch: string | undefined; worktreeName?: string } }
  | { type: 'REORDER_TABS'; payload: { fromIndex: number; toIndex: number } }
  | { type: 'RESTORE_SESSION'; payload: TabState }
  | { type: 'CLOSE_ALL_TABS' }
  | { type: 'CLOSE_OTHER_TABS'; payload: string }  // payload is tab id to keep
  | { type: 'CLOSE_KANBAN_FOR_PROJECT'; payload: string };  // payload is project path
```

**Step 2: Update useTabState reducer**

In `src/hooks/useTabState.ts`, add handlers for kanban tabs:

```typescript
// Add to the reducer switch statement:

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
      const label = cwd.split('/').pop() || cwd;
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
```

**Step 3: Update addTab to include type**

```typescript
  const addTab = useCallback((sessionId: string, cwd: string, containerState: ContainerState = 'starting', gitBranch?: string) => {
    const label = cwd.split('/').pop() || cwd;
    const tab: Tab = {
      id: generateTabId(),
      type: 'terminal',  // ADD THIS LINE
      sessionId,
      cwd,
      label,
      containerState,
      gitBranch,
    };
    dispatch({ type: 'ADD_TAB', payload: tab });
    return tab.id;
  }, []);
```

**Step 4: Add addKanbanTab and closeKanbanForProject helpers**

```typescript
  const addKanbanTab = useCallback((cwd: string) => {
    dispatch({ type: 'ADD_KANBAN_TAB', payload: { cwd } });
  }, []);

  const closeKanbanForProject = useCallback((projectPath: string) => {
    dispatch({ type: 'CLOSE_KANBAN_FOR_PROJECT', payload: projectPath });
  }, []);

  // Add to return object:
  return {
    // ... existing returns
    addKanbanTab,
    closeKanbanForProject,
  };
```

**Step 5: Run tests**

Run: `npm test`
Expected: PASS (existing tests should still pass)

**Step 6: Commit**

```bash
git add src/types/tabs.ts src/hooks/useTabState.ts
git commit -m "feat: add kanban tab type to tab system"
```

---

## Task 3: Create ProjectList Component

**Files:**
- Create: `src/components/ProjectList.tsx`

**Step 1: Create the ProjectList component**

```typescript
// src/components/ProjectList.tsx
import React from 'react';
import { Folder, X, Plus } from 'lucide-react';
import type { SidebarProject } from '../lib/sidebar-store';

interface ProjectListProps {
  projects: SidebarProject[];
  collapsed: boolean;
  onProjectClick: (path: string) => void;
  onProjectRemove: (path: string) => void;
  onAddProject: () => void;
}

export function ProjectList({
  projects,
  collapsed,
  onProjectClick,
  onProjectRemove,
  onAddProject,
}: ProjectListProps): React.ReactElement {
  // Extract folder name from path
  const getFolderName = (path: string): string => {
    return path.split('/').pop() || path;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-primary)]">
        {!collapsed && (
          <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Projects
          </span>
        )}
        <button
          data-testid="add-project-button"
          onClick={onAddProject}
          className="p-1 rounded text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] transition-colors"
          title="Add Project"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto py-1">
        {projects.length === 0 ? (
          !collapsed && (
            <div className="px-3 py-4 text-xs text-[var(--color-text-muted)] text-center">
              No projects yet.
              <br />
              Click + to add one.
            </div>
          )
        ) : (
          projects.map((project) => (
            <div
              key={project.path}
              data-testid={`project-item-${project.path}`}
              className="group flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] transition-colors"
              onClick={() => onProjectClick(project.path)}
              title={project.path}
            >
              <Folder size={14} className="shrink-0 text-[var(--color-text-muted)]" />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate text-sm">
                    {getFolderName(project.path)}
                  </span>
                  <button
                    data-testid={`remove-project-${project.path}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onProjectRemove(project.path);
                    }}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-bg-tertiary)] transition-all"
                    title="Remove project"
                  >
                    <X size={12} />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

**Step 2: Run app to verify component renders**

Run: `npm start` (Ctrl+C after build completes)
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/ProjectList.tsx
git commit -m "feat: add ProjectList component for sidebar"
```

---

## Task 4: Transform Sidebar Component

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Step 1: Replace Sidebar with project list**

```typescript
// src/components/Sidebar.tsx
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ProjectList } from './ProjectList';
import type { SidebarProject } from '../lib/sidebar-store';

interface SidebarProps {
  projects: SidebarProject[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onProjectClick: (path: string) => void;
  onProjectRemove: (path: string) => void;
  onAddProject: () => void;
}

export function Sidebar({
  projects,
  collapsed,
  onToggleCollapse,
  onProjectClick,
  onProjectRemove,
  onAddProject,
}: SidebarProps): React.ReactElement {
  return (
    <div
      className={`flex flex-col bg-[var(--color-bg-secondary)] border-r border-[var(--color-border-primary)] transition-all ${
        collapsed ? 'w-10' : 'w-48'
      }`}
    >
      {/* Project list */}
      <div className="flex-1 min-h-0">
        <ProjectList
          projects={projects}
          collapsed={collapsed}
          onProjectClick={onProjectClick}
          onProjectRemove={onProjectRemove}
          onAddProject={onAddProject}
        />
      </div>

      {/* Collapse toggle */}
      <button
        data-testid="collapse-toggle"
        onClick={onToggleCollapse}
        className="flex items-center justify-center p-2 text-[var(--color-text-secondary)] hover:text-white border-t border-[var(--color-border-primary)]"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "refactor: transform Sidebar to show project list instead of view toggle"
```

---

## Task 5: Update Tab Component for Kanban Icon

**Files:**
- Modify: `src/components/Tab.tsx`

**Step 1: Add kanban icon support**

```typescript
// src/components/Tab.tsx
import React from 'react';
import { X, Folder, LayoutGrid } from 'lucide-react';
import type { Tab as TabType, ContainerState } from '../types/tabs';

// Status indicator dot for container state
function StatusDot({ state }: { state: ContainerState }): React.ReactElement {
  const colors: Record<ContainerState, string> = {
    starting: 'bg-yellow-400 animate-pulse',
    running: 'bg-green-400',
    stopped: 'bg-gray-400',
    crashed: 'bg-red-400',
  };

  return (
    <span
      className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-gray-800 ${colors[state]}`}
      title={state.charAt(0).toUpperCase() + state.slice(1)}
    />
  );
}

interface TabProps {
  tab: TabType;
  isActive: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function Tab({ tab, isActive, onClick, onClose, onContextMenu }: TabProps): React.ReactElement {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();  // Don't trigger tab click
    onClose(e);
  };

  const isKanban = tab.type === 'kanban';

  return (
    <div
      role="tab"
      aria-selected={isActive}
      data-testid={`tab-${tab.id}`}
      data-active={isActive}
      data-tab-type={tab.type}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`
        group flex items-center gap-2 px-3 py-1.5 min-w-[120px] max-w-[200px]
        cursor-pointer select-none shrink-0
        border-r border-gray-700
        ${isActive
          ? 'bg-gray-700 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-750 hover:text-gray-200'
        }
      `}
    >
      {/* Icon - different for terminal vs kanban */}
      <div className="relative shrink-0">
        {isKanban ? (
          <LayoutGrid size={14} className="text-[var(--color-accent-primary)]" />
        ) : (
          <>
            <Folder size={14} className="text-gray-500" />
            {tab.containerState && <StatusDot state={tab.containerState} />}
          </>
        )}
      </div>

      {/* Label - truncate with ellipsis */}
      <span className="flex-1 truncate text-sm">
        {tab.label}
      </span>

      {/* Close button */}
      <button
        data-testid={`tab-close-${tab.id}`}
        onClick={handleClose}
        className={`
          p-0.5 rounded
          opacity-0 group-hover:opacity-100
          hover:bg-gray-600
          ${isActive ? 'opacity-100' : ''}
        `}
        aria-label={`Close ${tab.label}`}
      >
        <X size={14} />
      </button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/Tab.tsx
git commit -m "feat: add kanban board icon for kanban tabs"
```

---

## Task 6: Update App.tsx - Remove Old State, Add New

**Files:**
- Modify: `src/App.tsx`

This is the largest task. We need to:
1. Remove `activeView` and `kanbanProjectPath` state
2. Add sidebar projects state
3. Wire up project add/remove/click handlers
4. Update content rendering to show kanban for kanban tabs

**Step 1: Remove old imports and add new ones**

At the top of App.tsx, remove the `ViewType` import and add sidebar-store:

```typescript
// Remove this line:
// import { Sidebar, ViewType } from './components/Sidebar';

// Add these:
import { Sidebar } from './components/Sidebar';
import {
  getSidebarProjects,
  addSidebarProject,
  removeSidebarProject,
  type SidebarProject,
} from './lib/sidebar-store';
```

**Step 2: Remove old state, add new state**

Remove these lines:
```typescript
// REMOVE:
const [activeView, setActiveView] = useState<ViewType>('terminal');
const [kanbanProjectPath, setKanbanProjectPath] = useState<string | null>(null);
const [pathDialogMode, setPathDialogMode] = useState<'newTab' | 'createProject'>('newTab');
```

Add these:
```typescript
// ADD:
const [sidebarProjects, setSidebarProjects] = useState<SidebarProject[]>(() => getSidebarProjects());
```

**Step 3: Update useTabState destructuring**

Add the new functions:
```typescript
const {
  tabs,
  activeTabId,
  addTab,
  closeTab,
  setActiveTab,
  updateCwd,
  updateContainerState,
  updateGitBranch,
  closeAllTabs,
  closeOtherTabs,
  addKanbanTab,           // ADD
  closeKanbanForProject,  // ADD
} = useTabState();
```

**Step 4: Add project handlers**

```typescript
// Handle clicking a project in sidebar (opens kanban tab)
const handleProjectClick = useCallback((path: string) => {
  addKanbanTab(path);
}, [addKanbanTab]);

// Handle removing a project from sidebar
const handleProjectRemove = useCallback((path: string) => {
  // Close kanban tab if open
  closeKanbanForProject(path);
  // Remove from sidebar
  removeSidebarProject(path);
  setSidebarProjects(getSidebarProjects());
}, [closeKanbanForProject]);

// Handle adding a project via dialog
const handleAddProject = useCallback(() => {
  setPathDialogOpen(true);
}, []);
```

**Step 5: Update handlePathConfirm**

Simplify to only handle new tab creation and add project to sidebar:

```typescript
const handlePathConfirm = useCallback(async (path: string) => {
  let normalizedPath = path;
  if (normalizedPath.endsWith('/') && normalizedPath.length > 1) {
    normalizedPath = normalizedPath.slice(0, -1);
  }

  localStorage.setItem('yolium:lastPath', path);
  setLastUsedPath(path);
  setPathDialogOpen(false);

  // Check if this is from sidebar "Add Project" (no pending folder path set yet)
  // In that case, just add to sidebar and open kanban
  if (!agentDialogOpen) {
    addSidebarProject(normalizedPath);
    setSidebarProjects(getSidebarProjects());
    addKanbanTab(normalizedPath);
    return;
  }

  // Otherwise, this is creating a new terminal
  setPendingFolderPath(normalizedPath);
  setPendingFolderGitStatus(null);
  setAgentDialogOpen(true);

  try {
    const gitStatus = await window.electronAPI.checkGitRepo(normalizedPath);
    setPendingFolderGitStatus(gitStatus);
  } catch {
    setPendingFolderGitStatus({ isRepo: false, hasCommits: false });
  }
}, [addKanbanTab, agentDialogOpen]);
```

**Step 6: Update createYoliumWithAgent to add project to sidebar**

After creating the tab, add the project:

```typescript
const createYoliumWithAgent = useCallback(async (folderPath: string, agent: AgentType, gsdEnabled: boolean, worktreeEnabled: boolean = false, branchName: string | null = null) => {
  // ... existing code ...

  // Create yolium container with selected agent
  try {
    const sessionId = await window.electronAPI.createYolium(folderPath, agent, gsdEnabled, gitConfig || undefined, worktreeEnabled, branchName || undefined);

    const gitBranch = worktreeEnabled && branchName
      ? branchName
      : await window.electronAPI.getGitBranch(folderPath);
    const tabId = addTab(sessionId, folderPath, 'starting', gitBranch || undefined);

    // ADD: Add project to sidebar
    addSidebarProject(folderPath);
    setSidebarProjects(getSidebarProjects());

    setTimeout(() => {
      updateContainerState(tabId, 'running');
    }, 1000);
  } catch (err) {
    console.error('Failed to create yolium:', err);
    alert('Failed to start yolium. Check Docker is running.');
  }
}, [addTab, updateContainerState, gitConfig]);
```

**Step 7: Update handleNewYolium**

Remove pathDialogMode setting:

```typescript
const handleNewYolium = useCallback(async () => {
  const dockerOk = await window.electronAPI.isDockerAvailable();
  if (!dockerOk) {
    alert('Docker is not running. Please start Docker Desktop and try again.');
    return;
  }

  // Set pending path to indicate we're creating a terminal (not just adding project)
  setPendingFolderPath('__pending__');
  setPathDialogOpen(true);
}, []);
```

**Step 8: Remove handleCreateProject and related code**

Remove:
```typescript
// REMOVE this entire callback:
const handleCreateProject = useCallback(() => {
  setPathDialogMode('createProject');
  setPathDialogOpen(true);
}, []);
```

**Step 9: Remove view switching useEffect and handler**

Remove:
```typescript
// REMOVE:
useEffect(() => {
  if (tabs.length === 0 && activeView === 'kanban' && !kanbanProjectPath) {
    setActiveView('terminal');
  }
}, [tabs.length, activeView, kanbanProjectPath]);

const handleViewChange = useCallback((view: ViewType) => {
  setActiveView(view);
}, []);
```

**Step 10: Update keyboard shortcut registration**

Remove the project new handler since we're using sidebar now:
```typescript
// REMOVE this line:
const cleanupProjectNew = window.electronAPI.onProjectNew(handleCreateProject);

// And remove from cleanup:
// cleanupProjectNew();
```

**Step 11: Update Sidebar rendering**

```typescript
<Sidebar
  projects={sidebarProjects}
  collapsed={sidebarCollapsed}
  onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
  onProjectClick={handleProjectClick}
  onProjectRemove={handleProjectRemove}
  onAddProject={handleAddProject}
/>
```

**Step 12: Update main content rendering**

Replace the content area logic to handle kanban tabs:

```typescript
{/* Content area */}
<div className="flex-1 min-h-0 relative flex flex-col">
  {tabs.length === 0 ? (
    <>
      <div className="flex-1 min-h-0">
        <EmptyState onNewTab={handleNewYolium} />
      </div>
      {/* ... status bar ... */}
    </>
  ) : (
    <>
      {/* Render all tabs - terminals and kanbans */}
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`absolute inset-0 flex flex-col ${tab.id === activeTabId ? '' : 'hidden'}`}
        >
          {tab.type === 'terminal' ? (
            <>
              <div className="flex-1 min-h-0 relative">
                <Terminal
                  sessionId={tab.sessionId!}
                  isVisible={tab.id === activeTabId}
                  isContainer={true}
                  onCwdChange={(cwd) => handleCwdChange(tab.id, cwd)}
                  onExit={(exitCode) => {
                    const newState = exitCode === 0 ? 'stopped' : 'crashed';
                    updateContainerState(tab.id, newState);
                  }}
                  className="absolute inset-0 bg-[#0a0a0a]"
                />
              </div>
              <StatusBar
                folderPath={tab.cwd}
                containerState={tab.containerState!}
                onStop={() => handleStopYolium(tab.id)}
                onShowShortcuts={handleShowShortcuts}
                onOpenSettings={handleOpenGitConfig}
                onOpenCodeReview={handleOpenCodeReview}
                imageName={imageRemoved ? undefined : 'yolium:latest'}
                onRebuild={handleRebuildImage}
                isRebuilding={isRebuilding}
                gitBranch={tab.gitBranch}
                worktreeName={tab.worktreeName}
                whisperRecordingState={whisper.state.recordingState}
                whisperSelectedModel={whisper.state.selectedModel}
                onToggleRecording={whisper.toggleRecording}
                onOpenModelDialog={whisper.openModelDialog}
              />
            </>
          ) : (
            <KanbanView projectPath={tab.cwd} />
          )}
        </div>
      ))}
    </>
  )}
</div>
```

**Step 13: Update EmptyState call (remove onCreateProject)**

```typescript
<EmptyState onNewTab={handleNewYolium} />
```

**Step 14: Run tests and app**

Run: `npm test && npm start`
Expected: Tests pass, app builds and runs

**Step 15: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: integrate sidebar projects with kanban tabs"
```

---

## Task 7: Update EmptyState Component

**Files:**
- Modify: `src/components/EmptyState.tsx`

**Step 1: Remove Create Project button**

Remove the `onCreateProject` prop and the Create Project button:

```typescript
interface EmptyStateProps {
  onNewTab: () => void;
  // REMOVE: onCreateProject?: () => void;
}

// In the component, remove the onCreateProject destructuring
export function EmptyState({ onNewTab }: EmptyStateProps): React.ReactElement {
  // ...

  // In the CTA buttons section, remove the Create Project button:
  {/* CTA buttons */}
  <div className="flex items-center gap-3">
    <button
      onClick={onNewTab}
      className="flex flex-col items-center gap-1 px-5 py-2.5 bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-hover)] text-white font-medium rounded-lg transition-colors"
    >
      <span className="flex items-center gap-2">
        <Plus size={18} />
        New Yolium
      </span>
      <kbd className="text-[10px] opacity-70 font-mono">Ctrl+Shift+T</kbd>
    </button>
    {/* REMOVE the Create Project button entirely */}
  </div>
```

Also remove the `FolderPlus` import if no longer used.

**Step 2: Commit**

```bash
git add src/components/EmptyState.tsx
git commit -m "refactor: remove Create Project button from EmptyState"
```

---

## Task 8: Fix Path Dialog Flow

**Files:**
- Modify: `src/App.tsx`

**Step 1: Fix the path dialog flow to distinguish between add project and new terminal**

We need a flag to track whether the path dialog is for adding a project or creating a terminal:

```typescript
// Add state to track dialog purpose
const [pathDialogPurpose, setPathDialogPurpose] = useState<'addProject' | 'newTerminal'>('newTerminal');
```

Update handlers:

```typescript
const handleAddProject = useCallback(() => {
  setPathDialogPurpose('addProject');
  setPathDialogOpen(true);
}, []);

const handleNewYolium = useCallback(async () => {
  const dockerOk = await window.electronAPI.isDockerAvailable();
  if (!dockerOk) {
    alert('Docker is not running. Please start Docker Desktop and try again.');
    return;
  }
  setPathDialogPurpose('newTerminal');
  setPathDialogOpen(true);
}, []);

const handlePathConfirm = useCallback(async (path: string) => {
  let normalizedPath = path;
  if (normalizedPath.endsWith('/') && normalizedPath.length > 1) {
    normalizedPath = normalizedPath.slice(0, -1);
  }

  localStorage.setItem('yolium:lastPath', path);
  setLastUsedPath(path);
  setPathDialogOpen(false);

  if (pathDialogPurpose === 'addProject') {
    // Just add to sidebar and open kanban
    addSidebarProject(normalizedPath);
    setSidebarProjects(getSidebarProjects());
    addKanbanTab(normalizedPath);
    return;
  }

  // Creating a new terminal - open agent dialog
  setPendingFolderPath(normalizedPath);
  setPendingFolderGitStatus(null);
  setAgentDialogOpen(true);

  try {
    const gitStatus = await window.electronAPI.checkGitRepo(normalizedPath);
    setPendingFolderGitStatus(gitStatus);
  } catch {
    setPendingFolderGitStatus({ isRepo: false, hasCommits: false });
  }
}, [pathDialogPurpose, addKanbanTab]);
```

**Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "fix: distinguish between add project and new terminal in path dialog"
```

---

## Task 9: Update KanbanView Empty State Message

**Files:**
- Modify: `src/components/KanbanView.tsx`

**Step 1: Update the empty state message**

Since projects are now in the sidebar, update the message:

```typescript
// Empty state when no project selected
if (!projectPath) {
  return (
    <div
      data-testid="kanban-empty-state"
      className="flex-1 flex items-center justify-center bg-[var(--color-bg-primary)]"
    >
      <div className="text-center">
        <FolderOpen size={48} className="mx-auto mb-4 text-[var(--color-text-tertiary)]" />
        <p className="text-[var(--color-text-secondary)]">
          Click a project in the sidebar to view its Kanban board
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/KanbanView.tsx
git commit -m "fix: update KanbanView empty state message"
```

---

## Task 10: Final Testing and Cleanup

**Files:**
- All modified files

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Run the app and test manually**

Run: `npm start`

Test these flows:
1. Click + in sidebar → path dialog → project added to sidebar + kanban tab opens
2. Click "New Yolium" → path dialog → agent dialog → terminal opens, project auto-added to sidebar
3. Click existing project in sidebar → kanban tab opens/focuses
4. Click X on project in sidebar → project removed, kanban tab closes
5. Close kanban tab → project stays in sidebar
6. Close terminal tab → project stays in sidebar
7. Multiple kanban tabs not allowed for same project

**Step 3: Commit any fixes**

If any issues found, fix and commit:

```bash
git add -A
git commit -m "fix: address issues found in final testing"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/lib/sidebar-store.ts` | NEW - localStorage persistence for sidebar projects |
| `src/tests/sidebar-store.test.ts` | NEW - tests for sidebar store |
| `src/types/tabs.ts` | MODIFIED - added `TabType`, made terminal fields optional |
| `src/hooks/useTabState.ts` | MODIFIED - added kanban tab actions |
| `src/components/ProjectList.tsx` | NEW - project list component |
| `src/components/Sidebar.tsx` | MODIFIED - replaced view toggle with project list |
| `src/components/Tab.tsx` | MODIFIED - added kanban icon support |
| `src/components/EmptyState.tsx` | MODIFIED - removed Create Project button |
| `src/components/KanbanView.tsx` | MODIFIED - updated empty state message |
| `src/App.tsx` | MODIFIED - major refactor for new architecture |

# Kanban UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add sidebar-based navigation to switch between Terminal and Kanban views, with a full kanban board displaying work items for the active tab's project.

**Architecture:** Sidebar component added to App.tsx manages active view state. KanbanView fetches board data via IPC and renders columns/cards. Dialogs handle item creation and editing.

**Tech Stack:** React, TypeScript, lucide-react icons, Electron IPC

---

## Task 1: Create Sidebar Component

**Files:**
- Create: `src/components/Sidebar.tsx`
- Test: `src/tests/Sidebar.test.tsx`

**Step 1: Write the failing test**

```typescript
// src/tests/Sidebar.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../components/Sidebar';

describe('Sidebar', () => {
  it('should render terminal and kanban nav items', () => {
    render(
      <Sidebar
        activeView="terminal"
        onViewChange={vi.fn()}
        collapsed={true}
        onToggleCollapse={vi.fn()}
      />
    );

    expect(screen.getByTestId('nav-terminal')).toBeInTheDocument();
    expect(screen.getByTestId('nav-kanban')).toBeInTheDocument();
  });

  it('should highlight active view with accent border', () => {
    render(
      <Sidebar
        activeView="kanban"
        onViewChange={vi.fn()}
        collapsed={true}
        onToggleCollapse={vi.fn()}
      />
    );

    const kanbanNav = screen.getByTestId('nav-kanban');
    expect(kanbanNav).toHaveClass('border-l-2');
  });

  it('should call onViewChange when nav item clicked', () => {
    const onViewChange = vi.fn();
    render(
      <Sidebar
        activeView="terminal"
        onViewChange={onViewChange}
        collapsed={true}
        onToggleCollapse={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('nav-kanban'));
    expect(onViewChange).toHaveBeenCalledWith('kanban');
  });

  it('should show labels when expanded', () => {
    render(
      <Sidebar
        activeView="terminal"
        onViewChange={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />
    );

    expect(screen.getByText('Terminal')).toBeInTheDocument();
    expect(screen.getByText('Kanban')).toBeInTheDocument();
  });

  it('should toggle collapse when chevron clicked', () => {
    const onToggleCollapse = vi.fn();
    render(
      <Sidebar
        activeView="terminal"
        onViewChange={vi.fn()}
        collapsed={true}
        onToggleCollapse={onToggleCollapse}
      />
    );

    fireEvent.click(screen.getByTestId('collapse-toggle'));
    expect(onToggleCollapse).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/tests/Sidebar.test.tsx`
Expected: FAIL with "Cannot find module '../components/Sidebar'"

**Step 3: Write minimal implementation**

```typescript
// src/components/Sidebar.tsx
import React from 'react';
import { Terminal, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react';

export type ViewType = 'terminal' | 'kanban';

interface SidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({
  activeView,
  onViewChange,
  collapsed,
  onToggleCollapse,
}: SidebarProps): React.ReactElement {
  const navItems: { id: ViewType; icon: React.ReactNode; label: string }[] = [
    { id: 'terminal', icon: <Terminal size={18} />, label: 'Terminal' },
    { id: 'kanban', icon: <LayoutGrid size={18} />, label: 'Kanban' },
  ];

  return (
    <div
      className={`flex flex-col bg-[var(--color-bg-secondary)] border-r border-[var(--color-border-primary)] transition-all ${
        collapsed ? 'w-10' : 'w-40'
      }`}
    >
      {/* Navigation items */}
      <nav className="flex-1 py-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            data-testid={`nav-${item.id}`}
            onClick={() => onViewChange(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
              activeView === item.id
                ? 'border-l-2 border-[var(--color-accent-primary)] text-white bg-[var(--color-bg-tertiary)]'
                : 'border-l-2 border-transparent text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)]'
            }`}
          >
            {item.icon}
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

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

**Step 4: Run test to verify it passes**

Run: `npm test -- src/tests/Sidebar.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/Sidebar.tsx src/tests/Sidebar.test.tsx
git commit -m "feat(ui): add Sidebar component for view navigation"
```

---

## Task 2: Create KanbanCard Component

**Files:**
- Create: `src/components/KanbanCard.tsx`
- Test: `src/tests/KanbanCard.test.tsx`

**Step 1: Write the failing test**

```typescript
// src/tests/KanbanCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KanbanCard } from '../components/KanbanCard';
import type { KanbanItem } from '../types/kanban';

const mockItem: KanbanItem = {
  id: 'item-1',
  title: 'Add authentication',
  description: 'Implement JWT-based auth flow with refresh tokens',
  column: 'in-progress',
  agentType: 'claude',
  agentStatus: 'running',
  order: 1,
  createdAt: '2026-02-04T10:00:00Z',
  updatedAt: '2026-02-04T10:00:00Z',
  comments: [],
};

describe('KanbanCard', () => {
  it('should render item title', () => {
    render(<KanbanCard item={mockItem} onClick={vi.fn()} />);
    expect(screen.getByText('Add authentication')).toBeInTheDocument();
  });

  it('should render agent type badge', () => {
    render(<KanbanCard item={mockItem} onClick={vi.fn()} />);
    expect(screen.getByText('Claude')).toBeInTheDocument();
  });

  it('should show branch with git icon when set', () => {
    const itemWithBranch = { ...mockItem, branch: 'feature/auth' };
    render(<KanbanCard item={itemWithBranch} onClick={vi.fn()} />);
    expect(screen.getByText('feature/auth')).toBeInTheDocument();
  });

  it('should show running status indicator', () => {
    render(<KanbanCard item={mockItem} onClick={vi.fn()} />);
    expect(screen.getByText('Agent working...')).toBeInTheDocument();
  });

  it('should show waiting status indicator', () => {
    const waitingItem = { ...mockItem, agentStatus: 'waiting' as const };
    render(<KanbanCard item={waitingItem} onClick={vi.fn()} />);
    expect(screen.getByText('Needs input')).toBeInTheDocument();
  });

  it('should call onClick when card clicked', () => {
    const onClick = vi.fn();
    render(<KanbanCard item={mockItem} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('kanban-card'));
    expect(onClick).toHaveBeenCalledWith(mockItem);
  });

  it('should truncate long description', () => {
    const longDescItem = {
      ...mockItem,
      description: 'This is a very long description that should be truncated after two lines of text to keep the card compact and readable',
    };
    render(<KanbanCard item={longDescItem} onClick={vi.fn()} />);
    const desc = screen.getByTestId('card-description');
    expect(desc).toHaveClass('line-clamp-2');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/tests/KanbanCard.test.tsx`
Expected: FAIL with "Cannot find module '../components/KanbanCard'"

**Step 3: Write minimal implementation**

```typescript
// src/components/KanbanCard.tsx
import React from 'react';
import { GitBranch, Loader2, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import type { KanbanItem, AgentStatus } from '../types/kanban';

interface KanbanCardProps {
  item: KanbanItem;
  onClick: (item: KanbanItem) => void;
}

const agentTypeLabels: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
  shell: 'Shell',
};

const statusDisplay: Record<AgentStatus, { text: string; className: string; icon?: React.ReactNode } | null> = {
  idle: null,
  running: {
    text: 'Agent working...',
    className: 'text-yellow-400',
    icon: <Loader2 size={12} className="animate-spin" />,
  },
  waiting: {
    text: 'Needs input',
    className: 'text-orange-400',
    icon: <AlertCircle size={12} />,
  },
  interrupted: {
    text: 'Interrupted',
    className: 'text-orange-400',
    icon: <AlertCircle size={12} />,
  },
  completed: {
    text: 'Completed',
    className: 'text-green-400',
    icon: <CheckCircle size={12} />,
  },
  failed: {
    text: 'Failed',
    className: 'text-red-400',
    icon: <XCircle size={12} />,
  },
};

export function KanbanCard({ item, onClick }: KanbanCardProps): React.ReactElement {
  const status = statusDisplay[item.agentStatus];

  return (
    <div
      data-testid="kanban-card"
      onClick={() => onClick(item)}
      className="p-3 bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-primary)] hover:border-[var(--color-border-secondary)] cursor-pointer transition-colors"
    >
      {/* Title */}
      <h4 className="font-semibold text-[13px] text-white mb-2">{item.title}</h4>

      {/* Agent type badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
          {agentTypeLabels[item.agentType] || item.agentType}
        </span>
      </div>

      {/* Branch (if set) */}
      {item.branch && (
        <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] mb-2">
          <GitBranch size={12} />
          <span>{item.branch}</span>
        </div>
      )}

      {/* Description preview */}
      <p
        data-testid="card-description"
        className="text-xs text-[var(--color-text-secondary)] line-clamp-2 mb-2"
      >
        {item.description}
      </p>

      {/* Status indicator */}
      {status && (
        <div className={`flex items-center gap-1 text-xs ${status.className}`}>
          {status.icon}
          <span>{status.text}</span>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/tests/KanbanCard.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/KanbanCard.tsx src/tests/KanbanCard.test.tsx
git commit -m "feat(ui): add KanbanCard component for displaying work items"
```

---

## Task 3: Create KanbanColumn Component

**Files:**
- Create: `src/components/KanbanColumn.tsx`
- Test: `src/tests/KanbanColumn.test.tsx`

**Step 1: Write the failing test**

```typescript
// src/tests/KanbanColumn.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KanbanColumn } from '../components/KanbanColumn';
import type { KanbanItem, ColumnId } from '../types/kanban';

const mockItems: KanbanItem[] = [
  {
    id: 'item-1',
    title: 'Task 1',
    description: 'Description 1',
    column: 'backlog',
    agentType: 'claude',
    agentStatus: 'idle',
    order: 1,
    createdAt: '2026-02-04T10:00:00Z',
    updatedAt: '2026-02-04T10:00:00Z',
    comments: [],
  },
  {
    id: 'item-2',
    title: 'Task 2',
    description: 'Description 2',
    column: 'backlog',
    agentType: 'codex',
    agentStatus: 'idle',
    order: 2,
    createdAt: '2026-02-04T10:00:00Z',
    updatedAt: '2026-02-04T10:00:00Z',
    comments: [],
  },
];

describe('KanbanColumn', () => {
  it('should render column title', () => {
    render(
      <KanbanColumn
        columnId="backlog"
        title="Backlog"
        items={mockItems}
        onCardClick={vi.fn()}
      />
    );
    expect(screen.getByText('Backlog')).toBeInTheDocument();
  });

  it('should render item count', () => {
    render(
      <KanbanColumn
        columnId="backlog"
        title="Backlog"
        items={mockItems}
        onCardClick={vi.fn()}
      />
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should render all items as cards', () => {
    render(
      <KanbanColumn
        columnId="backlog"
        title="Backlog"
        items={mockItems}
        onCardClick={vi.fn()}
      />
    );
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Task 2')).toBeInTheDocument();
  });

  it('should have colored top border based on column', () => {
    const { container } = render(
      <KanbanColumn
        columnId="in-progress"
        title="In Progress"
        items={[]}
        onCardClick={vi.fn()}
      />
    );
    const column = container.firstChild;
    expect(column).toHaveClass('border-t-yellow-500');
  });

  it('should show empty state when no items', () => {
    render(
      <KanbanColumn
        columnId="done"
        title="Done"
        items={[]}
        onCardClick={vi.fn()}
      />
    );
    expect(screen.getByText('No items')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/tests/KanbanColumn.test.tsx`
Expected: FAIL with "Cannot find module '../components/KanbanColumn'"

**Step 3: Write minimal implementation**

```typescript
// src/components/KanbanColumn.tsx
import React from 'react';
import { KanbanCard } from './KanbanCard';
import type { KanbanItem, ColumnId } from '../types/kanban';

interface KanbanColumnProps {
  columnId: ColumnId;
  title: string;
  items: KanbanItem[];
  onCardClick: (item: KanbanItem) => void;
}

const columnColors: Record<ColumnId, string> = {
  backlog: 'border-t-gray-500',
  ready: 'border-t-blue-500',
  'in-progress': 'border-t-yellow-500',
  done: 'border-t-green-500',
};

export function KanbanColumn({
  columnId,
  title,
  items,
  onCardClick,
}: KanbanColumnProps): React.ReactElement {
  return (
    <div
      className={`flex flex-col w-72 min-w-72 bg-[var(--color-bg-secondary)] rounded-lg border-t-2 ${columnColors[columnId]}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-primary)]">
        <h3 className="font-medium text-sm text-white">{title}</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)] text-center py-4">
            No items
          </p>
        ) : (
          items.map((item) => (
            <KanbanCard key={item.id} item={item} onClick={onCardClick} />
          ))
        )}
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/tests/KanbanColumn.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/KanbanColumn.tsx src/tests/KanbanColumn.test.tsx
git commit -m "feat(ui): add KanbanColumn component for board columns"
```

---

## Task 4: Create KanbanView Component

**Files:**
- Create: `src/components/KanbanView.tsx`
- Test: `src/tests/KanbanView.test.tsx`

**Step 1: Write the failing test**

```typescript
// src/tests/KanbanView.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KanbanView } from '../components/KanbanView';
import type { KanbanBoard } from '../types/kanban';

const mockBoard: KanbanBoard = {
  id: 'board-1',
  projectPath: '/path/to/project',
  items: [
    {
      id: 'item-1',
      title: 'Task 1',
      description: 'Desc 1',
      column: 'backlog',
      agentType: 'claude',
      agentStatus: 'idle',
      order: 1,
      createdAt: '2026-02-04T10:00:00Z',
      updatedAt: '2026-02-04T10:00:00Z',
      comments: [],
    },
    {
      id: 'item-2',
      title: 'Task 2',
      description: 'Desc 2',
      column: 'in-progress',
      agentType: 'codex',
      agentStatus: 'running',
      order: 1,
      createdAt: '2026-02-04T10:00:00Z',
      updatedAt: '2026-02-04T10:00:00Z',
      comments: [],
    },
  ],
  createdAt: '2026-02-04T10:00:00Z',
  updatedAt: '2026-02-04T10:00:00Z',
};

// Mock electronAPI
const mockElectronAPI = {
  kanbanGetBoard: vi.fn(),
  onKanbanBoardUpdated: vi.fn(() => vi.fn()),
};

beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI;
});

describe('KanbanView', () => {
  it('should show loading state initially', () => {
    mockElectronAPI.kanbanGetBoard.mockImplementation(() => new Promise(() => {}));
    render(<KanbanView projectPath="/path/to/project" />);
    expect(screen.getByTestId('kanban-loading')).toBeInTheDocument();
  });

  it('should render all four columns', async () => {
    mockElectronAPI.kanbanGetBoard.mockResolvedValue(mockBoard);
    render(<KanbanView projectPath="/path/to/project" />);

    await waitFor(() => {
      expect(screen.getByText('Backlog')).toBeInTheDocument();
      expect(screen.getByText('Ready')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
    });
  });

  it('should display project path in toolbar', async () => {
    mockElectronAPI.kanbanGetBoard.mockResolvedValue(mockBoard);
    render(<KanbanView projectPath="/path/to/project" />);

    await waitFor(() => {
      expect(screen.getByText('/path/to/project')).toBeInTheDocument();
    });
  });

  it('should show items in correct columns', async () => {
    mockElectronAPI.kanbanGetBoard.mockResolvedValue(mockBoard);
    render(<KanbanView projectPath="/path/to/project" />);

    await waitFor(() => {
      expect(screen.getByText('Task 1')).toBeInTheDocument();
      expect(screen.getByText('Task 2')).toBeInTheDocument();
    });
  });

  it('should show empty state when no project path', () => {
    render(<KanbanView projectPath={null} />);
    expect(screen.getByText('No project selected')).toBeInTheDocument();
  });

  it('should have New Item button in toolbar', async () => {
    mockElectronAPI.kanbanGetBoard.mockResolvedValue(mockBoard);
    render(<KanbanView projectPath="/path/to/project" />);

    await waitFor(() => {
      expect(screen.getByText('New Item')).toBeInTheDocument();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/tests/KanbanView.test.tsx`
Expected: FAIL with "Cannot find module '../components/KanbanView'"

**Step 3: Write minimal implementation**

```typescript
// src/components/KanbanView.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, RefreshCw, FolderOpen } from 'lucide-react';
import { KanbanColumn } from './KanbanColumn';
import { NewItemDialog } from './NewItemDialog';
import { ItemDetailDialog } from './ItemDetailDialog';
import type { KanbanBoard, KanbanItem, ColumnId } from '../types/kanban';

interface KanbanViewProps {
  projectPath: string | null;
}

const columns: { id: ColumnId; title: string }[] = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'ready', title: 'Ready' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'done', title: 'Done' },
];

export function KanbanView({ projectPath }: KanbanViewProps): React.ReactElement {
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const [newItemDialogOpen, setNewItemDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<KanbanItem | null>(null);

  const loadBoard = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const data = await window.electronAPI.kanbanGetBoard(projectPath);
      setBoard(data);
    } catch (err) {
      console.error('Failed to load kanban board:', err);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  // Listen for board updates
  useEffect(() => {
    if (!projectPath) return;
    const cleanup = window.electronAPI.onKanbanBoardUpdated((updatedBoard) => {
      if (updatedBoard.projectPath === projectPath) {
        setBoard(updatedBoard);
      }
    });
    return cleanup;
  }, [projectPath]);

  const handleCardClick = useCallback((item: KanbanItem) => {
    setSelectedItem(item);
  }, []);

  const handleNewItemCreated = useCallback(() => {
    setNewItemDialogOpen(false);
    loadBoard();
  }, [loadBoard]);

  const handleItemUpdated = useCallback(() => {
    setSelectedItem(null);
    loadBoard();
  }, [loadBoard]);

  // Empty state when no project
  if (!projectPath) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="text-center">
          <FolderOpen size={48} className="mx-auto mb-4 text-[var(--color-text-muted)]" />
          <p className="text-[var(--color-text-secondary)]">No project selected</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            Select a tab to view its kanban board
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading && !board) {
    return (
      <div
        data-testid="kanban-loading"
        className="flex-1 flex items-center justify-center bg-[var(--color-bg-primary)]"
      >
        <Loader2 className="w-8 h-8 text-[var(--color-text-secondary)] animate-spin" />
      </div>
    );
  }

  const getItemsForColumn = (columnId: ColumnId): KanbanItem[] => {
    if (!board) return [];
    return board.items
      .filter((item) => item.column === columnId)
      .sort((a, b) => a.order - b.order);
  };

  return (
    <div className="flex-1 flex flex-col bg-[var(--color-bg-primary)] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <FolderOpen size={14} />
          <span>{projectPath}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadBoard}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] rounded transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => setNewItemDialogOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-hover)] text-white rounded transition-colors"
          >
            <Plus size={14} />
            New Item
          </button>
        </div>
      </div>

      {/* Columns */}
      <div className="flex-1 flex gap-4 p-4 overflow-x-auto">
        {columns.map((col) => (
          <KanbanColumn
            key={col.id}
            columnId={col.id}
            title={col.title}
            items={getItemsForColumn(col.id)}
            onCardClick={handleCardClick}
          />
        ))}
      </div>

      {/* New Item Dialog */}
      <NewItemDialog
        isOpen={newItemDialogOpen}
        projectPath={projectPath}
        onClose={() => setNewItemDialogOpen(false)}
        onCreated={handleNewItemCreated}
      />

      {/* Item Detail Dialog */}
      <ItemDetailDialog
        isOpen={selectedItem !== null}
        item={selectedItem}
        projectPath={projectPath}
        onClose={() => setSelectedItem(null)}
        onUpdated={handleItemUpdated}
      />
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/tests/KanbanView.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/KanbanView.tsx src/tests/KanbanView.test.tsx
git commit -m "feat(ui): add KanbanView component with columns and toolbar"
```

---

## Task 5: Create NewItemDialog Component

**Files:**
- Create: `src/components/NewItemDialog.tsx`
- Test: `src/tests/NewItemDialog.test.tsx`

**Step 1: Write the failing test**

```typescript
// src/tests/NewItemDialog.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NewItemDialog } from '../components/NewItemDialog';

const mockElectronAPI = {
  kanbanAddItem: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI;
});

describe('NewItemDialog', () => {
  it('should not render when closed', () => {
    render(
      <NewItemDialog
        isOpen={false}
        projectPath="/path"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    );
    expect(screen.queryByText('New Item')).not.toBeInTheDocument();
  });

  it('should render form fields when open', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/path"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Branch (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Agent Type')).toBeInTheDocument();
  });

  it('should disable submit when title is empty', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/path"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('should enable submit when title and description provided', () => {
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/path"
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Desc' } });
    expect(screen.getByRole('button', { name: 'Create' })).not.toBeDisabled();
  });

  it('should call kanbanAddItem on submit', async () => {
    mockElectronAPI.kanbanAddItem.mockResolvedValue({ id: 'new-1' });
    const onCreated = vi.fn();

    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/path/to/project"
        onClose={vi.fn()}
        onCreated={onCreated}
      />
    );

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Task' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Do something' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockElectronAPI.kanbanAddItem).toHaveBeenCalledWith(
        '/path/to/project',
        expect.objectContaining({
          title: 'New Task',
          description: 'Do something',
          agentType: 'claude',
        })
      );
      expect(onCreated).toHaveBeenCalled();
    });
  });

  it('should close on cancel', () => {
    const onClose = vi.fn();
    render(
      <NewItemDialog
        isOpen={true}
        projectPath="/path"
        onClose={onClose}
        onCreated={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/tests/NewItemDialog.test.tsx`
Expected: FAIL with "Cannot find module '../components/NewItemDialog'"

**Step 3: Write minimal implementation**

```typescript
// src/components/NewItemDialog.tsx
import React, { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import type { AgentType } from '../types/kanban';

interface NewItemDialogProps {
  isOpen: boolean;
  projectPath: string;
  onClose: () => void;
  onCreated: () => void;
}

const agentTypes: { value: AgentType; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'shell', label: 'Shell' },
];

export function NewItemDialog({
  isOpen,
  projectPath,
  onClose,
  onCreated,
}: NewItemDialogProps): React.ReactElement | null {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [branch, setBranch] = useState('');
  const [agentType, setAgentType] = useState<AgentType>('claude');
  const [submitting, setSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setBranch('');
    setAgentType('claude');
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setSubmitting(true);
    try {
      await window.electronAPI.kanbanAddItem(projectPath, {
        title: title.trim(),
        description: description.trim(),
        branch: branch.trim() || undefined,
        agentType,
        order: Date.now(), // Simple ordering
      });
      resetForm();
      onCreated();
    } catch (err) {
      console.error('Failed to create item:', err);
    } finally {
      setSubmitting(false);
    }
  }, [title, description, branch, agentType, projectPath, onCreated, resetForm]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  if (!isOpen) return null;

  const isValid = title.trim().length > 0 && description.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[var(--color-bg-secondary)] rounded-lg w-full max-w-lg mx-4 shadow-xl border border-[var(--color-border-primary)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-primary)]">
          <h2 className="text-lg font-semibold text-white">New Item</h2>
          <button
            onClick={handleClose}
            className="text-[var(--color-text-secondary)] hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)]"
              placeholder="What needs to be done?"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)] resize-none"
              placeholder="Describe the task in detail..."
            />
          </div>

          {/* Branch */}
          <div>
            <label htmlFor="branch" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Branch (optional)
            </label>
            <input
              id="branch"
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)]"
              placeholder="feature/my-feature"
            />
          </div>

          {/* Agent Type */}
          <div>
            <label htmlFor="agentType" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Agent Type
            </label>
            <select
              id="agentType"
              value={agentType}
              onChange={(e) => setAgentType(e.target.value as AgentType)}
              className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)]"
            >
              {agentTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="px-4 py-2 text-sm bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-hover)] text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/tests/NewItemDialog.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/NewItemDialog.tsx src/tests/NewItemDialog.test.tsx
git commit -m "feat(ui): add NewItemDialog for creating kanban items"
```

---

## Task 6: Create ItemDetailDialog Component

**Files:**
- Create: `src/components/ItemDetailDialog.tsx`
- Test: `src/tests/ItemDetailDialog.test.tsx`

**Step 1: Write the failing test**

```typescript
// src/tests/ItemDetailDialog.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ItemDetailDialog } from '../components/ItemDetailDialog';
import type { KanbanItem } from '../types/kanban';

const mockItem: KanbanItem = {
  id: 'item-1',
  title: 'Add authentication',
  description: 'Implement JWT auth',
  column: 'in-progress',
  agentType: 'claude',
  agentStatus: 'running',
  order: 1,
  createdAt: '2026-02-04T10:00:00Z',
  updatedAt: '2026-02-04T10:00:00Z',
  comments: [
    { id: 'c1', source: 'agent', text: 'Starting implementation...', timestamp: '2026-02-04T10:01:00Z' },
    { id: 'c2', source: 'user', text: 'Use bcrypt for hashing', timestamp: '2026-02-04T10:02:00Z' },
  ],
};

const mockElectronAPI = {
  kanbanUpdateItem: vi.fn(),
  kanbanDeleteItem: vi.fn(),
  showConfirmOkCancel: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI;
});

describe('ItemDetailDialog', () => {
  it('should not render when closed', () => {
    render(
      <ItemDetailDialog
        isOpen={false}
        item={mockItem}
        projectPath="/path"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    );
    expect(screen.queryByText('Add authentication')).not.toBeInTheDocument();
  });

  it('should render item details when open', () => {
    render(
      <ItemDetailDialog
        isOpen={true}
        item={mockItem}
        projectPath="/path"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue('Add authentication')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Implement JWT auth')).toBeInTheDocument();
  });

  it('should show comments', () => {
    render(
      <ItemDetailDialog
        isOpen={true}
        item={mockItem}
        projectPath="/path"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    );
    expect(screen.getByText('Starting implementation...')).toBeInTheDocument();
    expect(screen.getByText('Use bcrypt for hashing')).toBeInTheDocument();
  });

  it('should show agent status', () => {
    render(
      <ItemDetailDialog
        isOpen={true}
        item={mockItem}
        projectPath="/path"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    );
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('should call update on save', async () => {
    mockElectronAPI.kanbanUpdateItem.mockResolvedValue({});
    const onUpdated = vi.fn();

    render(
      <ItemDetailDialog
        isOpen={true}
        item={mockItem}
        projectPath="/path"
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />
    );

    // Change description
    fireEvent.change(screen.getByDisplayValue('Implement JWT auth'), {
      target: { value: 'Updated description' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockElectronAPI.kanbanUpdateItem).toHaveBeenCalled();
      expect(onUpdated).toHaveBeenCalled();
    });
  });

  it('should confirm before delete', async () => {
    mockElectronAPI.showConfirmOkCancel.mockResolvedValue(true);
    mockElectronAPI.kanbanDeleteItem.mockResolvedValue({});

    render(
      <ItemDetailDialog
        isOpen={true}
        item={mockItem}
        projectPath="/path"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockElectronAPI.showConfirmOkCancel).toHaveBeenCalled();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/tests/ItemDetailDialog.test.tsx`
Expected: FAIL with "Cannot find module '../components/ItemDetailDialog'"

**Step 3: Write minimal implementation**

```typescript
// src/components/ItemDetailDialog.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { X, Trash2, GitBranch, Clock } from 'lucide-react';
import type { KanbanItem, ColumnId, AgentStatus } from '../types/kanban';

interface ItemDetailDialogProps {
  isOpen: boolean;
  item: KanbanItem | null;
  projectPath: string;
  onClose: () => void;
  onUpdated: () => void;
}

const columnOptions: { id: ColumnId; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'ready', label: 'Ready' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
];

const statusColors: Record<AgentStatus, string> = {
  idle: 'text-gray-400',
  running: 'text-yellow-400',
  waiting: 'text-orange-400',
  interrupted: 'text-orange-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
};

export function ItemDetailDialog({
  isOpen,
  item,
  projectPath,
  onClose,
  onUpdated,
}: ItemDetailDialogProps): React.ReactElement | null {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [column, setColumn] = useState<ColumnId>('backlog');
  const [saving, setSaving] = useState(false);

  // Sync state when item changes
  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setDescription(item.description);
      setColumn(item.column);
    }
  }, [item]);

  const handleSave = useCallback(async () => {
    if (!item) return;
    setSaving(true);
    try {
      await window.electronAPI.kanbanUpdateItem(projectPath, item.id, {
        title: title.trim(),
        description: description.trim(),
        column,
      });
      onUpdated();
    } catch (err) {
      console.error('Failed to update item:', err);
    } finally {
      setSaving(false);
    }
  }, [item, title, description, column, projectPath, onUpdated]);

  const handleDelete = useCallback(async () => {
    if (!item) return;
    const confirmed = await window.electronAPI.showConfirmOkCancel(
      'Delete Item',
      `Delete "${item.title}"? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await window.electronAPI.kanbanDeleteItem(projectPath, item.id);
      onUpdated();
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  }, [item, projectPath, onUpdated]);

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[var(--color-bg-secondary)] rounded-lg w-full max-w-3xl mx-4 shadow-xl border border-[var(--color-border-primary)] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-primary)] shrink-0">
          <h2 className="text-lg font-semibold text-white">Item Details</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-secondary)] hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Two-pane layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left pane - editable fields */}
          <div className="flex-1 p-4 overflow-y-auto border-r border-[var(--color-border-primary)]">
            {/* Title */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)]"
              />
            </div>

            {/* Description */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-white text-sm focus:outline-none focus:border-[var(--color-accent-primary)] resize-none"
              />
            </div>

            {/* Comments (read-only) */}
            <div>
              <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Comments ({item.comments.length})
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {item.comments.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)]">No comments yet</p>
                ) : (
                  item.comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="p-2 bg-[var(--color-bg-primary)] rounded text-sm"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-medium ${
                          comment.source === 'agent' ? 'text-blue-400' :
                          comment.source === 'user' ? 'text-green-400' :
                          'text-gray-400'
                        }`}>
                          [{comment.source}]
                        </span>
                        <span className="text-[var(--color-text-muted)] text-xs">
                          {new Date(comment.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-[var(--color-text-secondary)]">{comment.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right pane - metadata and actions */}
          <div className="w-56 p-4 space-y-4 bg-[var(--color-bg-tertiary)]">
            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1 uppercase">
                Status
              </label>
              <span className={`text-sm ${statusColors[item.agentStatus]}`}>
                {item.agentStatus}
              </span>
            </div>

            {/* Agent Type */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1 uppercase">
                Agent
              </label>
              <span className="text-sm text-[var(--color-text-secondary)] capitalize">
                {item.agentType}
              </span>
            </div>

            {/* Column */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1 uppercase">
                Column
              </label>
              <select
                value={column}
                onChange={(e) => setColumn(e.target.value as ColumnId)}
                className="w-full px-2 py-1 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded text-sm text-white"
              >
                {columnOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Branch */}
            {item.branch && (
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1 uppercase">
                  Branch
                </label>
                <div className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)]">
                  <GitBranch size={12} />
                  <span>{item.branch}</span>
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1 uppercase">
                Created
              </label>
              <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                <Clock size={10} />
                <span>{new Date(item.createdAt).toLocaleString()}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 space-y-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full px-3 py-2 text-sm bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-hover)] text-white rounded transition-colors disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={handleDelete}
                className="w-full flex items-center justify-center gap-1 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 rounded transition-colors"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/tests/ItemDetailDialog.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ItemDetailDialog.tsx src/tests/ItemDetailDialog.test.tsx
git commit -m "feat(ui): add ItemDetailDialog for viewing/editing kanban items"
```

---

## Task 7: Add Preload API for Kanban IPC

**Files:**
- Modify: `src/preload.ts`

**Step 1: Check existing preload**

Run: `grep -n "kanban" src/preload.ts`
Expected: Should show existing kanban handlers from backend implementation

**Step 2: Verify kanban APIs exist**

Read src/preload.ts and verify these methods exist:
- `kanbanGetBoard`
- `kanbanAddItem`
- `kanbanUpdateItem`
- `kanbanDeleteItem`
- `onKanbanBoardUpdated`

If any are missing, add them following the existing pattern.

**Step 3: Add any missing APIs**

If needed, add the missing IPC handlers to match the UI component requirements.

**Step 4: Commit if changes made**

```bash
git add src/preload.ts
git commit -m "feat(ipc): ensure kanban preload APIs are complete"
```

---

## Task 8: Integrate Sidebar and KanbanView into App.tsx

**Files:**
- Modify: `src/App.tsx`

**Step 1: Import new components**

Add imports at top of App.tsx:
```typescript
import { Sidebar, ViewType } from './components/Sidebar';
import { KanbanView } from './components/KanbanView';
```

**Step 2: Add view state**

After the existing state declarations (around line 80), add:
```typescript
// State for sidebar and view switching
const [activeView, setActiveView] = useState<ViewType>('terminal');
const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
```

**Step 3: Modify layout structure**

Replace the main content area (around line 684) to include sidebar:

```typescript
{/* Main content area with sidebar */}
<main className="flex-1 min-h-0 relative flex">
  {/* Sidebar */}
  <Sidebar
    activeView={activeView}
    onViewChange={setActiveView}
    collapsed={sidebarCollapsed}
    onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
  />

  {/* Content area */}
  <div className="flex-1 min-h-0 relative flex flex-col">
    {tabs.length === 0 ? (
      <EmptyState onNewTab={handleNewYolium} />
    ) : activeView === 'terminal' ? (
      // Existing terminal rendering
      <>
        {tabs.map(tab => (
          // ... existing terminal code
        ))}
      </>
    ) : (
      // Kanban view
      <KanbanView
        projectPath={activeTabId ? tabs.find(t => t.id === activeTabId)?.cwd || null : null}
      />
    )}
  </div>
</main>
```

**Step 4: Run tests to verify no regressions**

Run: `npm test`
Expected: All tests pass

**Step 5: Visual verification**

Run: `npm start`
Verify:
- Sidebar appears on left
- Clicking Terminal/Kanban switches views
- Sidebar collapses/expands properly
- Kanban board loads when switching to Kanban view

**Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): integrate Sidebar and KanbanView into App"
```

---

## Task 9: Run Full Test Suite

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass (existing + new)

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds without errors

**Step 3: Manual smoke test**

Run: `npm start`
Test:
1. App launches with sidebar
2. Terminal view works as before
3. Switching to Kanban view shows board
4. Creating a new item works
5. Clicking a card opens detail dialog
6. Switching tabs updates Kanban board

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve test/build issues"
```

---

## Summary

| Task | Component | Lines Est. |
|------|-----------|------------|
| 1 | Sidebar.tsx | ~80 |
| 2 | KanbanCard.tsx | ~100 |
| 3 | KanbanColumn.tsx | ~60 |
| 4 | KanbanView.tsx | ~120 |
| 5 | NewItemDialog.tsx | ~150 |
| 6 | ItemDetailDialog.tsx | ~200 |
| 7 | preload.ts (verify) | ~10 |
| 8 | App.tsx (modify) | ~50 |
| 9 | Full test suite | - |

Total: ~770 lines of new code across 6 new components + 1 modified file

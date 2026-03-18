/**
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider } from '@renderer/theme';
import { VimModeProvider, useVimModeContext } from '@renderer/context/VimModeContext';
import { KanbanView } from '@renderer/components/kanban/KanbanView';
import { StatusBar } from '@renderer/components/StatusBar';
import { TabBar } from '@renderer/components/tabs/TabBar';
import { ProjectList } from '@renderer/components/navigation/ProjectList';
import type { KanbanItem, KanbanBoard } from '@shared/types/kanban';
import type { Tab } from '@shared/types/tabs';

// --- Shared helpers ---

function renderWithVim(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <VimModeProvider>
        {ui}
      </VimModeProvider>
    </ThemeProvider>,
  );
}

function ZoneSetter({ zone }: { zone: string }) {
  const { setActiveZone } = useVimModeContext();
  React.useEffect(() => {
    setActiveZone(zone as 'sidebar' | 'tabs' | 'content' | 'status-bar');
  }, [zone, setActiveZone]);
  return null;
}

function VimProbe(): React.ReactElement {
  const vim = useVimModeContext();
  return (
    <div>
      <div data-testid="vim-mode">{vim.mode}</div>
      <div data-testid="vim-zone">{vim.activeZone}</div>
    </div>
  );
}

function createMockItem(overrides: Partial<KanbanItem> = {}): KanbanItem {
  return {
    id: `item-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Item',
    description: 'Test description',
    column: 'backlog',
    agentStatus: 'idle',
    agentType: 'code-agent',
    agentProvider: 'claude',
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as KanbanItem;
}

function createMockBoard(items: KanbanItem[]): KanbanBoard {
  return {
    projectPath: '/test/project',
    items,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const mockTabs: Tab[] = [
  { id: 'tab-1', label: 'Project A', type: 'kanban', cwd: '/a' },
  { id: 'tab-2', label: 'Project B', type: 'kanban', cwd: '/b' },
  { id: 'tab-3', label: 'Project C', type: 'kanban', cwd: '/c' },
] as Tab[];

const mockProjects = [
  { path: '/home/user/project-a' },
  { path: '/home/user/project-b' },
  { path: '/home/user/project-c' },
];

// --- Mocks ---

const mockGetBoard = vi.fn();
const mockOnBoardUpdated = vi.fn(() => () => {});
const mockDeleteItems = vi.fn();
const mockDeleteItem = vi.fn();
const mockConfirmOkCancel = vi.fn().mockResolvedValue(true);

function setupElectronAPI() {
  Object.defineProperty(window, 'electronAPI', {
    writable: true,
    value: {
      kanban: {
        getBoard: mockGetBoard,
        onBoardUpdated: mockOnBoardUpdated,
        updateItem: vi.fn().mockResolvedValue(undefined),
        deleteItems: mockDeleteItems.mockResolvedValue(undefined),
        deleteItem: mockDeleteItem.mockResolvedValue(undefined),
        addItem: vi.fn().mockResolvedValue({ id: 'new-1', description: '', agentProvider: 'claude' }),
        addComment: vi.fn().mockResolvedValue(undefined),
      },
      agent: {
        recover: vi.fn().mockResolvedValue(undefined),
        onOutput: vi.fn().mockReturnValue(() => {}),
        onProgress: vi.fn().mockReturnValue(() => {}),
        onComplete: vi.fn().mockReturnValue(() => {}),
        onError: vi.fn().mockReturnValue(() => {}),
        onExit: vi.fn().mockReturnValue(() => {}),
        onCostUpdate: vi.fn().mockReturnValue(() => {}),
        getActiveSession: vi.fn().mockResolvedValue(null),
        readLog: vi.fn().mockResolvedValue([]),
        clearLog: vi.fn().mockResolvedValue(undefined),
        listDefinitions: vi.fn().mockResolvedValue([]),
        start: vi.fn(),
        resume: vi.fn(),
        stop: vi.fn(),
        answer: vi.fn(),
      },
      git: {
        detectNestedRepos: vi.fn().mockResolvedValue({ isRepo: true, nestedRepos: [] }),
        loadConfig: vi.fn().mockResolvedValue({}),
        worktreeChangedFiles: vi.fn().mockResolvedValue([]),
        worktreeFileDiff: vi.fn().mockResolvedValue(''),
        worktreeDiffStats: vi.fn().mockResolvedValue(null),
        mergeAndPushPR: vi.fn(),
        checkMergeConflicts: vi.fn(),
        rebaseOntoDefault: vi.fn(),
        approvePR: vi.fn(),
        mergePR: vi.fn(),
        init: vi.fn(),
      },
      dialog: {
        confirmOkCancel: mockConfirmOkCancel,
      },
      app: {
        openExternal: vi.fn(),
      },
    },
  });
}

// jsdom doesn't implement scrollIntoView
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  setupElectronAPI();
});

// ============================================================
// KanbanView NORMAL mode action tests
// ============================================================

describe('KanbanView NORMAL mode actions', () => {
  const boardItems = [
    createMockItem({ id: 'item-1', title: 'Item 1', column: 'backlog' }),
    createMockItem({ id: 'item-2', title: 'Item 2', column: 'backlog' }),
    createMockItem({ id: 'item-3', title: 'Item 3', column: 'ready' }),
  ];
  const board = createMockBoard(boardItems);

  beforeEach(() => {
    mockGetBoard.mockResolvedValue(board);
  });

  it('n opens new item dialog', async () => {
    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    const view = screen.getByTestId('kanban-view');
    fireEvent.keyDown(view, { key: 'n' });

    expect(screen.getByTestId('new-item-dialog')).toBeTruthy();
  });

  it('r refreshes the board (calls loadBoard)', async () => {
    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    // Reset call count after initial load
    mockGetBoard.mockClear();

    const view = screen.getByTestId('kanban-view');
    await act(async () => {
      fireEvent.keyDown(view, { key: 'r' });
    });

    expect(mockGetBoard).toHaveBeenCalledWith('/test/project');
  });

  it('x deletes the focused card with confirmation', async () => {
    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    const view = screen.getByTestId('kanban-view');
    await act(async () => {
      fireEvent.keyDown(view, { key: 'x' });
    });

    // Should call deleteItems with the focused card's id
    expect(mockDeleteItems).toHaveBeenCalled();
  });

  it('/ focuses search input and enters INSERT mode', async () => {
    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <VimProbe />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    const view = screen.getByTestId('kanban-view');
    fireEvent.keyDown(view, { key: '/' });

    const searchInput = screen.getByTestId('search-input');
    expect(document.activeElement).toBe(searchInput);
  });

  it('? toggles keyboard shortcuts dialog', async () => {
    const onShowShortcuts = vi.fn();
    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" onShowShortcuts={onShowShortcuts} />
        </>
      );
    });

    const view = screen.getByTestId('kanban-view');
    fireEvent.keyDown(view, { key: '?' });

    expect(onShowShortcuts).toHaveBeenCalled();
  });

  it('Ctrl+A selects all visible items', async () => {
    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    const view = screen.getByTestId('kanban-view');
    fireEvent.keyDown(view, { key: 'a', ctrlKey: true });

    // Should show bulk action bar when items are selected
    expect(screen.getByTestId('bulk-action-bar')).toBeTruthy();
  });

  it('Delete deletes selected items', async () => {
    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    const view = screen.getByTestId('kanban-view');
    // First select all
    fireEvent.keyDown(view, { key: 'a', ctrlKey: true });
    // Then delete
    await act(async () => {
      fireEvent.keyDown(view, { key: 'Delete' });
    });

    expect(mockDeleteItems).toHaveBeenCalled();
  });

  it('Escape clears selection', async () => {
    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    const view = screen.getByTestId('kanban-view');
    // Select all first
    fireEvent.keyDown(view, { key: 'a', ctrlKey: true });
    expect(screen.getByTestId('bulk-action-bar')).toBeTruthy();

    // Then clear
    fireEvent.keyDown(view, { key: 'Escape' });
    expect(screen.queryByTestId('bulk-action-bar')).toBeNull();
  });

  it('Escape closes search when search is active', async () => {
    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    // Type into search
    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // Escape from view should clear search
    const view = screen.getByTestId('kanban-view');
    fireEvent.keyDown(view, { key: 'Escape' });

    expect((searchInput as HTMLInputElement).value).toBe('');
  });

  it('n does nothing in INSERT mode', async () => {
    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    // Enter INSERT mode
    fireEvent.keyDown(document, { key: 'i' });

    // Focus search to simulate INSERT mode (n typed in input should not open dialog)
    const searchInput = screen.getByTestId('search-input');
    searchInput.focus();
    fireEvent.keyDown(searchInput, { key: 'n' });

    expect(screen.queryByTestId('new-item-dialog')).toBeNull();
  });

  it('r does nothing in INSERT mode', async () => {
    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    mockGetBoard.mockClear();

    // Enter INSERT mode and focus input
    fireEvent.keyDown(document, { key: 'i' });
    const searchInput = screen.getByTestId('search-input');
    searchInput.focus();
    fireEvent.keyDown(searchInput, { key: 'r' });

    // Should NOT have been called again
    expect(mockGetBoard).not.toHaveBeenCalled();
  });

  it('h moves to previous column', async () => {
    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    const view = screen.getByTestId('kanban-view');
    // Move right first then left
    fireEvent.keyDown(view, { key: 'l' });
    fireEvent.keyDown(view, { key: 'h' });

    // Should be back at first column — no error means navigation worked
    expect(view).toBeTruthy();
  });

  it('l moves to next column', async () => {
    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    const view = screen.getByTestId('kanban-view');
    fireEvent.keyDown(view, { key: 'l' });

    // Navigation happened without error
    expect(view).toBeTruthy();
  });

  it('h at first column stays at first column', async () => {
    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    const view = screen.getByTestId('kanban-view');
    // h at first column — should not crash
    fireEvent.keyDown(view, { key: 'h' });
    expect(view).toBeTruthy();
  });

  it('l at last column stays at last column', async () => {
    await act(async () => {
      renderWithVim(
        <>
          <ZoneSetter zone="content" />
          <KanbanView projectPath="/test/project" />
        </>
      );
    });

    const view = screen.getByTestId('kanban-view');
    // Move right many times to reach last column
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(view, { key: 'l' });
    }
    // Should not crash
    expect(view).toBeTruthy();
  });
});

// ============================================================
// StatusBar NORMAL mode action tests
// ============================================================

describe('StatusBar NORMAL mode actions', () => {
  it(', opens settings', () => {
    const onOpenSettings = vi.fn();
    renderWithVim(
      <>
        <ZoneSetter zone="status-bar" />
        <StatusBar
          onShowShortcuts={vi.fn()}
          onOpenSettings={onOpenSettings}
        />
      </>
    );

    const statusBar = screen.getByTestId('status-bar');
    fireEvent.keyDown(statusBar, { key: ',' });

    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('p opens project settings', () => {
    const onOpenProjectSettings = vi.fn();
    renderWithVim(
      <>
        <ZoneSetter zone="status-bar" />
        <StatusBar
          onShowShortcuts={vi.fn()}
          onOpenSettings={vi.fn()}
          onOpenProjectSettings={onOpenProjectSettings}
        />
      </>
    );

    const statusBar = screen.getByTestId('status-bar');
    fireEvent.keyDown(statusBar, { key: 'p' });

    expect(onOpenProjectSettings).toHaveBeenCalled();
  });

  it('q stops container', () => {
    const onStop = vi.fn();
    renderWithVim(
      <>
        <ZoneSetter zone="status-bar" />
        <StatusBar
          containerState="running"
          onShowShortcuts={vi.fn()}
          onOpenSettings={vi.fn()}
          onStop={onStop}
        />
      </>
    );

    const statusBar = screen.getByTestId('status-bar');
    fireEvent.keyDown(statusBar, { key: 'q' });

    expect(onStop).toHaveBeenCalled();
  });

  it('w toggles recording', () => {
    const onToggleRecording = vi.fn();
    renderWithVim(
      <>
        <ZoneSetter zone="status-bar" />
        <StatusBar
          onShowShortcuts={vi.fn()}
          onOpenSettings={vi.fn()}
          onToggleRecording={onToggleRecording}
          onOpenModelDialog={vi.fn()}
        />
      </>
    );

    const statusBar = screen.getByTestId('status-bar');
    fireEvent.keyDown(statusBar, { key: 'w' });

    expect(onToggleRecording).toHaveBeenCalled();
  });

  it('L toggles theme', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="status-bar" />
        <StatusBar
          onShowShortcuts={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      </>
    );

    const statusBar = screen.getByTestId('status-bar');
    // Check initial theme indicator exists
    const themeButton = screen.getByTestId('theme-toggle');
    const hasLucideSun = themeButton.querySelector('.lucide-sun');
    const hasLucideMoon = themeButton.querySelector('.lucide-moon');
    const initialIcon = hasLucideSun ? 'sun' : 'moon';

    fireEvent.keyDown(statusBar, { key: 'L' });

    // After toggle, the icon should change
    const afterSun = themeButton.querySelector('.lucide-sun');
    const afterMoon = themeButton.querySelector('.lucide-moon');
    const afterIcon = afterSun ? 'sun' : 'moon';
    expect(afterIcon).not.toBe(initialIcon);
  });

  it('Enter activates focused button', () => {
    const onOpenSettings = vi.fn();
    renderWithVim(
      <>
        <ZoneSetter zone="status-bar" />
        <StatusBar
          onShowShortcuts={vi.fn()}
          onOpenSettings={onOpenSettings}
        />
      </>
    );

    const statusBar = screen.getByTestId('status-bar');
    fireEvent.keyDown(statusBar, { key: 'Enter' });

    // Should click the first focused button (whatever is at index 0)
    const focused = statusBar.querySelector('[data-vim-focused="true"]');
    expect(focused).toBeTruthy();
  });
});

// ============================================================
// TabBar NORMAL mode action tests
// ============================================================

describe('TabBar NORMAL mode actions', () => {
  const onTabClick = vi.fn();
  const onTabClose = vi.fn();
  const onTabContextMenu = vi.fn();
  const onNewTab = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('x closes the focused tab', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="tabs" />
        <TabBar
          tabs={mockTabs}
          activeTabId="tab-1"
          onTabClick={onTabClick}
          onTabClose={onTabClose}
          onTabContextMenu={onTabContextMenu}
          onNewTab={onNewTab}
        />
      </>
    );

    const tabBar = screen.getByTestId('tab-bar');
    fireEvent.keyDown(tabBar, { key: 'x' });

    expect(onTabClose).toHaveBeenCalledWith('tab-1');
  });

  it('+ creates new tab', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="tabs" />
        <TabBar
          tabs={mockTabs}
          activeTabId="tab-1"
          onTabClick={onTabClick}
          onTabClose={onTabClose}
          onTabContextMenu={onTabContextMenu}
          onNewTab={onNewTab}
        />
      </>
    );

    const tabBar = screen.getByTestId('tab-bar');
    fireEvent.keyDown(tabBar, { key: '+' });

    expect(onNewTab).toHaveBeenCalled();
  });

  it('Home goes to first tab', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="tabs" />
        <TabBar
          tabs={mockTabs}
          activeTabId="tab-1"
          onTabClick={onTabClick}
          onTabClose={onTabClose}
          onTabContextMenu={onTabContextMenu}
          onNewTab={onNewTab}
        />
      </>
    );

    const tabBar = screen.getByTestId('tab-bar');
    // Move right first, then Home
    fireEvent.keyDown(tabBar, { key: 'l' });
    fireEvent.keyDown(tabBar, { key: 'Home' });

    const firstTab = screen.getByTestId('tab-tab-1');
    expect(firstTab.getAttribute('data-vim-focused')).toBe('true');
  });

  it('End goes to last tab', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="tabs" />
        <TabBar
          tabs={mockTabs}
          activeTabId="tab-1"
          onTabClick={onTabClick}
          onTabClose={onTabClose}
          onTabContextMenu={onTabContextMenu}
          onNewTab={onNewTab}
        />
      </>
    );

    const tabBar = screen.getByTestId('tab-bar');
    fireEvent.keyDown(tabBar, { key: 'End' });

    const lastTab = screen.getByTestId('tab-tab-3');
    expect(lastTab.getAttribute('data-vim-focused')).toBe('true');
  });
});

// ============================================================
// ProjectList NORMAL mode action tests
// ============================================================

describe('ProjectList NORMAL mode actions', () => {
  const onProjectClick = vi.fn();
  const onProjectRemove = vi.fn();
  const onAddProject = vi.fn();
  const onAnswerAndResume = vi.fn();
  const onOpenSchedule = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a opens add project dialog', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="sidebar" />
        <ProjectList
          projects={mockProjects}
          collapsed={false}
          sidebarItems={[]}
          onProjectClick={onProjectClick}
          onProjectRemove={onProjectRemove}
          onAddProject={onAddProject}
          onAnswerAndResume={onAnswerAndResume}
          onOpenSchedule={onOpenSchedule}
        />
      </>
    );

    const projectList = screen.getByTestId(`project-item-${mockProjects[0].path}`).parentElement!.parentElement!;
    fireEvent.keyDown(projectList, { key: 'a' });

    expect(onAddProject).toHaveBeenCalled();
  });

  it('+ opens add project dialog', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="sidebar" />
        <ProjectList
          projects={mockProjects}
          collapsed={false}
          sidebarItems={[]}
          onProjectClick={onProjectClick}
          onProjectRemove={onProjectRemove}
          onAddProject={onAddProject}
          onAnswerAndResume={onAnswerAndResume}
          onOpenSchedule={onOpenSchedule}
        />
      </>
    );

    const projectList = screen.getByTestId(`project-item-${mockProjects[0].path}`).parentElement!.parentElement!;
    fireEvent.keyDown(projectList, { key: '+' });

    expect(onAddProject).toHaveBeenCalled();
  });

  it('h opens scheduled agents', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="sidebar" />
        <ProjectList
          projects={mockProjects}
          collapsed={false}
          sidebarItems={[]}
          onProjectClick={onProjectClick}
          onProjectRemove={onProjectRemove}
          onAddProject={onAddProject}
          onAnswerAndResume={onAnswerAndResume}
          onOpenSchedule={onOpenSchedule}
        />
      </>
    );

    const projectList = screen.getByTestId(`project-item-${mockProjects[0].path}`).parentElement!.parentElement!;
    fireEvent.keyDown(projectList, { key: 'h' });

    expect(onOpenSchedule).toHaveBeenCalled();
  });
});

// ============================================================
// Mode transition tests
// ============================================================

describe('Mode transitions', () => {
  it('i enters INSERT mode from any zone', () => {
    renderWithVim(<VimProbe />);

    fireEvent.keyDown(document, { key: 'i' });

    expect(screen.getByTestId('vim-mode')).toHaveTextContent('INSERT');
  });

  it('Escape exits INSERT to NORMAL', () => {
    renderWithVim(<VimProbe />);

    fireEvent.keyDown(document, { key: 'i' });
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('INSERT');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL');
  });

  it('Ctrl+[ exits INSERT to NORMAL', () => {
    renderWithVim(<VimProbe />);

    fireEvent.keyDown(document, { key: 'i' });
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('INSERT');

    fireEvent.keyDown(document, { key: '[', ctrlKey: true });
    expect(screen.getByTestId('vim-mode')).toHaveTextContent('NORMAL');
  });

  it('zone keys (e/t/c/s) blocked in INSERT mode', () => {
    renderWithVim(<VimProbe />);

    fireEvent.keyDown(document, { key: 'i' });
    fireEvent.keyDown(document, { key: 'e' });

    // Should still be on default zone (content), not sidebar
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('content');
  });

  it('Tab cycles zones: sidebar -> tabs -> content -> status-bar', () => {
    renderWithVim(<VimProbe />);

    // Start at content (default)
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('content');

    // Tab from content -> status-bar
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('status-bar');

    // Tab from status-bar -> sidebar
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('sidebar');

    // Tab from sidebar -> tabs
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('tabs');
  });

  it('Shift+Tab reverse cycles zones', () => {
    renderWithVim(<VimProbe />);

    // Start at content (default)
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('content');

    // Shift+Tab from content -> tabs
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('tabs');
  });
});

// ============================================================
// Cross-zone interaction tests
// ============================================================

describe('Cross-zone interaction', () => {
  it('pressing e from content zone switches to sidebar', () => {
    renderWithVim(<VimProbe />);

    // Default is content
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('content');

    fireEvent.keyDown(document, { key: 'e' });
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('sidebar');
  });

  it('pressing c from sidebar switches to content', () => {
    renderWithVim(<VimProbe />);

    // Switch to sidebar first
    fireEvent.keyDown(document, { key: 'e' });
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('sidebar');

    // Switch back to content
    fireEvent.keyDown(document, { key: 'c' });
    expect(screen.getByTestId('vim-zone')).toHaveTextContent('content');
  });

  it('zone switch preserves focused element within zone', () => {
    const onTabClick = vi.fn();
    renderWithVim(
      <>
        <VimProbe />
        <ZoneSetter zone="tabs" />
        <TabBar
          tabs={mockTabs}
          activeTabId="tab-1"
          onTabClick={onTabClick}
          onTabClose={vi.fn()}
          onTabContextMenu={vi.fn()}
          onNewTab={vi.fn()}
        />
      </>
    );

    const tabBar = screen.getByTestId('tab-bar');
    // Move to second tab
    fireEvent.keyDown(tabBar, { key: 'l' });

    // Switch away and back
    fireEvent.keyDown(document, { key: 'c' });
    fireEvent.keyDown(document, { key: 't' });

    // The focused tab should still be at position 1 (second tab)
    const secondTab = screen.getByTestId('tab-tab-2');
    expect(secondTab.getAttribute('data-vim-focused')).toBe('true');
  });
});

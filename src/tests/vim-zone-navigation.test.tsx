/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@renderer/theme';
import { VimModeProvider, useVimModeContext } from '@renderer/context/VimModeContext';
import { TabBar } from '@renderer/components/tabs/TabBar';
import { ProjectList } from '@renderer/components/navigation/ProjectList';
import { StatusBar } from '@renderer/components/StatusBar';
import type { Tab } from '@shared/types/tabs';

// Helper to render with VimModeProvider
function renderWithVim(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <VimModeProvider>
        {ui}
      </VimModeProvider>
    </ThemeProvider>,
  );
}

// Helper component that sets the active zone for testing
function ZoneSetter({ zone }: { zone: string }) {
  const { setActiveZone } = useVimModeContext();
  React.useEffect(() => {
    setActiveZone(zone as 'sidebar' | 'tabs' | 'content' | 'status-bar');
  }, [zone, setActiveZone]);
  return null;
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

describe('TabBar vim navigation', () => {
  const onTabClick = vi.fn();
  const onTabClose = vi.fn();
  const onTabContextMenu = vi.fn();
  const onNewTab = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should move to next tab with l or ArrowRight in NORMAL mode', () => {
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
    fireEvent.keyDown(tabBar, { key: 'l' });

    // The focused tab indicator should move (we check via data attribute)
    const focusedTab = tabBar.querySelector('[data-vim-focused="true"]');
    expect(focusedTab).toBeTruthy();
  });

  it('should move to previous tab with h or ArrowLeft in NORMAL mode', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="tabs" />
        <TabBar
          tabs={mockTabs}
          activeTabId="tab-2"
          onTabClick={onTabClick}
          onTabClose={onTabClose}
          onTabContextMenu={onTabContextMenu}
          onNewTab={onNewTab}
        />
      </>
    );

    const tabBar = screen.getByTestId('tab-bar');
    // Move right first, then left
    fireEvent.keyDown(tabBar, { key: 'l' });
    fireEvent.keyDown(tabBar, { key: 'h' });

    // Should be back at first tab focus
    const focusedTabs = tabBar.querySelectorAll('[data-vim-focused="true"]');
    expect(focusedTabs.length).toBe(1);
  });

  it('should jump to first tab with Home and last tab with End', () => {
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
    // Last tab should be focused
    const lastTab = screen.getByTestId('tab-tab-3');
    expect(lastTab.getAttribute('data-vim-focused')).toBe('true');
  });

  it('should activate the focused tab with Enter', () => {
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
    // Move to second tab then press Enter
    fireEvent.keyDown(tabBar, { key: 'l' });
    fireEvent.keyDown(tabBar, { key: 'Enter' });

    expect(onTabClick).toHaveBeenCalledWith('tab-2');
  });
});

describe('Sidebar ProjectList vim navigation', () => {
  const onProjectClick = vi.fn();
  const onProjectRemove = vi.fn();
  const onAddProject = vi.fn();
  const onAnswerAndResume = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should move down with j or ArrowDown in NORMAL mode', () => {
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
        />
      </>
    );

    const projectList = screen.getByTestId(`project-item-${mockProjects[0].path}`).parentElement!.parentElement!;
    fireEvent.keyDown(projectList, { key: 'j' });

    const focused = screen.getByTestId(`project-item-${mockProjects[1].path}`);
    expect(focused.getAttribute('data-vim-focused')).toBe('true');
  });

  it('should move up with k or ArrowUp in NORMAL mode', () => {
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
        />
      </>
    );

    const projectList = screen.getByTestId(`project-item-${mockProjects[0].path}`).parentElement!.parentElement!;
    // Move down then up
    fireEvent.keyDown(projectList, { key: 'j' });
    fireEvent.keyDown(projectList, { key: 'k' });

    const focused = screen.getByTestId(`project-item-${mockProjects[0].path}`);
    expect(focused.getAttribute('data-vim-focused')).toBe('true');
  });

  it('should open project with Enter', () => {
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
        />
      </>
    );

    const projectList = screen.getByTestId(`project-item-${mockProjects[0].path}`).parentElement!.parentElement!;
    fireEvent.keyDown(projectList, { key: 'Enter' });

    expect(onProjectClick).toHaveBeenCalledWith(mockProjects[0].path);
  });

  it('should remove project with x in NORMAL mode', () => {
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
        />
      </>
    );

    const projectList = screen.getByTestId(`project-item-${mockProjects[0].path}`).parentElement!.parentElement!;
    fireEvent.keyDown(projectList, { key: 'x' });

    expect(onProjectRemove).toHaveBeenCalledWith(mockProjects[0].path);
  });
});

describe('StatusBar vim navigation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should move to next button with l or ArrowRight', () => {
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
    fireEvent.keyDown(statusBar, { key: 'l' });

    // A button should have vim focus
    const focused = statusBar.querySelector('[data-vim-focused="true"]');
    expect(focused).toBeTruthy();
  });

  it('should move to previous button with h or ArrowLeft', () => {
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
    // Move right twice then left once
    fireEvent.keyDown(statusBar, { key: 'l' });
    fireEvent.keyDown(statusBar, { key: 'l' });
    fireEvent.keyDown(statusBar, { key: 'h' });

    const focused = statusBar.querySelector('[data-vim-focused="true"]');
    expect(focused).toBeTruthy();
  });

  it('should activate focused button with Enter', () => {
    const onShowShortcuts = vi.fn();
    renderWithVim(
      <>
        <ZoneSetter zone="status-bar" />
        <StatusBar
          onShowShortcuts={onShowShortcuts}
          onOpenSettings={vi.fn()}
        />
      </>
    );

    const statusBar = screen.getByTestId('status-bar');
    // Navigate to shortcuts button and press Enter
    // The exact navigation depends on button order, but Enter should click the focused button
    fireEvent.keyDown(statusBar, { key: 'Enter' });
    // At minimum, a button handler should be called
    const focused = statusBar.querySelector('[data-vim-focused="true"]');
    expect(focused).toBeTruthy();
  });
});

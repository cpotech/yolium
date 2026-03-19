/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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
] as Tab[];

const mockProjects = [
  { path: '/home/user/project-a' },
  { path: '/home/user/project-b' },
];

describe('Vim zone focus management', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should call .focus() on ProjectList container when sidebar zone becomes active', () => {
    const { container } = renderWithVim(
      <>
        <ZoneSetter zone="sidebar" />
        <ProjectList
          projects={mockProjects}
          collapsed={false}
          sidebarItems={[]}
          onProjectClick={vi.fn()}
          onProjectRemove={vi.fn()}
          onOpenProject={vi.fn()}
          onAnswerAndResume={vi.fn()}
        />
      </>
    );

    // The container div with tabIndex should have received focus
    const focusableDiv = container.querySelector('[tabindex="0"]') as HTMLElement;
    expect(focusableDiv).toBeTruthy();
    expect(document.activeElement).toBe(focusableDiv);
  });

  it('should call .focus() on TabBar container when tabs zone becomes active', () => {
    renderWithVim(
      <>
        <ZoneSetter zone="tabs" />
        <TabBar
          tabs={mockTabs}
          activeTabId="tab-1"
          onTabClick={vi.fn()}
          onTabClose={vi.fn()}
          onTabContextMenu={vi.fn()}
          onNewTab={vi.fn()}
        />
      </>
    );

    const tabBar = screen.getByTestId('tab-bar');
    expect(document.activeElement).toBe(tabBar);
  });

  it('should call .focus() on StatusBar container when status-bar zone becomes active', () => {
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
    expect(document.activeElement).toBe(statusBar);
  });

  it('should not steal focus from INPUT/TEXTAREA/SELECT elements when zone becomes active', () => {
    // Render with an input that we can focus before zone activation
    function TestWithInput() {
      const inputRef = React.useRef<HTMLInputElement>(null);
      React.useEffect(() => {
        inputRef.current?.focus();
      }, []);
      return (
        <>
          <input ref={inputRef} data-testid="test-input" />
          <ProjectList
            projects={mockProjects}
            collapsed={false}
            sidebarItems={[]}
            onProjectClick={vi.fn()}
            onProjectRemove={vi.fn()}
            onOpenProject={vi.fn()}
            onAnswerAndResume={vi.fn()}
          />
        </>
      );
    }

    renderWithVim(
      <>
        <ZoneSetter zone="sidebar" />
        <TestWithInput />
      </>
    );

    const input = screen.getByTestId('test-input');
    // The input should retain focus since it's an INPUT element
    expect(document.activeElement).toBe(input);
  });

  it('should move DOM focus between zones when switching from sidebar to tabs', () => {
    // Start with sidebar active, then switch to tabs
    function ZoneSwitcher() {
      const { setActiveZone } = useVimModeContext();
      const [zone, setZone] = React.useState<'sidebar' | 'tabs'>('sidebar');

      React.useEffect(() => {
        setActiveZone(zone);
      }, [zone, setActiveZone]);

      return (
        <button data-testid="switch-zone" onClick={() => setZone('tabs')}>
          Switch
        </button>
      );
    }

    renderWithVim(
      <>
        <ZoneSwitcher />
        <ProjectList
          projects={mockProjects}
          collapsed={false}
          sidebarItems={[]}
          onProjectClick={vi.fn()}
          onProjectRemove={vi.fn()}
          onOpenProject={vi.fn()}
          onAnswerAndResume={vi.fn()}
        />
        <TabBar
          tabs={mockTabs}
          activeTabId="tab-1"
          onTabClick={vi.fn()}
          onTabClose={vi.fn()}
          onTabContextMenu={vi.fn()}
          onNewTab={vi.fn()}
        />
      </>
    );

    // Initially sidebar should be focused
    const sidebarContainer = document.querySelector('[tabindex="0"]') as HTMLElement;
    expect(document.activeElement).toBe(sidebarContainer);

    // Switch zone to tabs
    act(() => {
      screen.getByTestId('switch-zone').click();
    });

    // TabBar should now have focus
    const tabBar = screen.getByTestId('tab-bar');
    expect(document.activeElement).toBe(tabBar);
  });
});

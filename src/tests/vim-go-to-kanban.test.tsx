/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVimMode } from '@renderer/hooks/useVimMode';
import type { Tab } from '@shared/types/tabs';

// Helper to create a kanban tab
function makeKanbanTab(id: string, cwd: string): Tab {
  return { id, type: 'kanban', cwd, label: cwd.split('/').pop()! };
}

// Helper to create a terminal tab
function makeTerminalTab(id: string, cwd: string): Tab {
  return { id, type: 'terminal', cwd, label: cwd.split('/').pop()!, sessionId: `session-${id}` };
}

describe('Go to kanban (b key) integration', () => {
  it('should switch to existing kanban tab when b is pressed and active tab is not kanban', () => {
    const setActiveTab = vi.fn();
    const kanbanTab = makeKanbanTab('k1', '/project/a');
    const terminalTab = makeTerminalTab('t1', '/project/a');
    const tabs: Tab[] = [terminalTab, kanbanTab];
    const activeTabId = 't1';

    const onGoToKanban = () => {
      const kanbanTabs = tabs.filter(t => t.type === 'kanban');
      if (kanbanTabs.length > 0) {
        setActiveTab(kanbanTabs[0].id);
      }
    };

    const { result } = renderHook(() => useVimMode({ onGoToKanban }));

    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'b' }));
    });

    expect(setActiveTab).toHaveBeenCalledWith('k1');
  });

  it('should cycle to next kanban tab when b is pressed and active tab is already a kanban tab', () => {
    const setActiveTab = vi.fn();
    const kanbanTab1 = makeKanbanTab('k1', '/project/a');
    const kanbanTab2 = makeKanbanTab('k2', '/project/b');
    const tabs: Tab[] = [kanbanTab1, kanbanTab2];
    const activeTabId = 'k1';

    const onGoToKanban = () => {
      const kanbanTabs = tabs.filter(t => t.type === 'kanban');
      if (kanbanTabs.length > 1) {
        const currentIndex = kanbanTabs.findIndex(t => t.id === activeTabId);
        const nextIndex = (currentIndex + 1) % kanbanTabs.length;
        setActiveTab(kanbanTabs[nextIndex].id);
      }
    };

    const { result } = renderHook(() => useVimMode({ onGoToKanban }));

    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'b' }));
    });

    expect(setActiveTab).toHaveBeenCalledWith('k2');
  });

  it('should open first sidebar project kanban when b is pressed and no kanban tabs exist', () => {
    const addKanbanTab = vi.fn();
    const tabs: Tab[] = [makeTerminalTab('t1', '/project/a')];
    const sidebarProjects = [{ path: '/project/x', label: 'x' }];

    const onGoToKanban = () => {
      const kanbanTabs = tabs.filter(t => t.type === 'kanban');
      if (kanbanTabs.length === 0 && sidebarProjects.length > 0) {
        addKanbanTab(sidebarProjects[0].path);
      }
    };

    const { result } = renderHook(() => useVimMode({ onGoToKanban }));

    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'b' }));
    });

    expect(addKanbanTab).toHaveBeenCalledWith('/project/x');
  });

  it('should do nothing when b is pressed and no kanban tabs and no sidebar projects exist', () => {
    const setActiveTab = vi.fn();
    const addKanbanTab = vi.fn();
    const tabs: Tab[] = [makeTerminalTab('t1', '/project/a')];
    const sidebarProjects: { path: string; label: string }[] = [];

    const onGoToKanban = () => {
      const kanbanTabs = tabs.filter(t => t.type === 'kanban');
      if (kanbanTabs.length === 0 && sidebarProjects.length > 0) {
        addKanbanTab(sidebarProjects[0].path);
      } else if (kanbanTabs.length > 0) {
        setActiveTab(kanbanTabs[0].id);
      }
    };

    const { result } = renderHook(() => useVimMode({ onGoToKanban }));

    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'b' }));
    });

    expect(setActiveTab).not.toHaveBeenCalled();
    expect(addKanbanTab).not.toHaveBeenCalled();
  });

  it('should focus content zone after switching to kanban tab', () => {
    const setActiveTab = vi.fn();
    const onZoneChange = vi.fn();
    const kanbanTab = makeKanbanTab('k1', '/project/a');
    const terminalTab = makeTerminalTab('t1', '/project/a');
    const tabs: Tab[] = [terminalTab, kanbanTab];

    const onGoToKanban = () => {
      const kanbanTabs = tabs.filter(t => t.type === 'kanban');
      if (kanbanTabs.length > 0) {
        setActiveTab(kanbanTabs[0].id);
      }
    };

    const { result } = renderHook(() => useVimMode({ onGoToKanban, onZoneChange }));

    // First move away from content zone
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'e' }));
    });
    expect(result.current.activeZone).toBe('sidebar');

    // Press b — should switch to kanban and set zone to content
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'b' }));
    });

    expect(setActiveTab).toHaveBeenCalledWith('k1');
    // The b key handler should also set zone to content
    expect(result.current.activeZone).toBe('content');
  });
});

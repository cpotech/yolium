import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSidebarProjects,
  addSidebarProject,
  removeSidebarProject,
  clearSidebarProjects,
} from '@renderer/stores/sidebar-store';

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

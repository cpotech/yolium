/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { VIM_ACTIONS, getActionsForZone } from '@shared/vim-actions';

describe('VIM_ACTIONS manifest consistency', () => {
  it('should export a non-empty VIM_ACTIONS array', () => {
    expect(Array.isArray(VIM_ACTIONS)).toBe(true);
    expect(VIM_ACTIONS.length).toBeGreaterThanOrEqual(42);
  });

  it('every action should have a unique id', () => {
    const ids = VIM_ACTIONS.map(a => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every action should have a non-empty key, zone, mode, and description', () => {
    for (const action of VIM_ACTIONS) {
      expect(action.key.length).toBeGreaterThan(0);
      expect(action.zone.length).toBeGreaterThan(0);
      expect(action.mode.length).toBeGreaterThan(0);
      expect(action.description.length).toBeGreaterThan(0);
    }
  });

  it('every zone in manifest should be a valid VimZone or global/dialog', () => {
    const validZones = new Set(['sidebar', 'tabs', 'content', 'status-bar', 'global', 'dialog']);
    for (const action of VIM_ACTIONS) {
      expect(validZones.has(action.zone)).toBe(true);
    }
  });

  it('every action mode should be NORMAL', () => {
    for (const action of VIM_ACTIONS) {
      expect(action.mode).toBe('NORMAL');
    }
  });

  it('no two actions in the same zone should have the same key (except multi-key like gg and alt keys)', () => {
    const zoneKeyPairs = new Map<string, string[]>();
    for (const action of VIM_ACTIONS) {
      const pairKey = `${action.zone}:${action.key}`;
      if (!zoneKeyPairs.has(pairKey)) {
        zoneKeyPairs.set(pairKey, []);
      }
      zoneKeyPairs.get(pairKey)!.push(action.id);
    }
    for (const [pairKey, ids] of zoneKeyPairs) {
      if (ids.length > 1) {
        // Allow known exceptions: sidebar has both 'a' and '+' mapping to add project
        // The '+' key in sidebar is an alt key (project-add-alt)
        const key = pairKey.split(':')[1];
        const isMultiKey = key === 'gg';
        const isAltMapping = ids.some(id => id.endsWith('-alt'));
        expect(isMultiKey || isAltMapping).toBe(true);
      }
    }
  });

  it('manifest should include actions for all 4 zones plus global and dialog', () => {
    const zones = new Set(VIM_ACTIONS.map(a => a.zone));
    expect(zones.has('sidebar')).toBe(true);
    expect(zones.has('tabs')).toBe(true);
    expect(zones.has('content')).toBe(true);
    expect(zones.has('status-bar')).toBe(true);
    expect(zones.has('global')).toBe(true);
    expect(zones.has('dialog')).toBe(true);
  });

  it('getActionsForZone returns only actions matching the given zone', () => {
    const contentActions = getActionsForZone('content');
    expect(contentActions.length).toBeGreaterThan(0);
    for (const action of contentActions) {
      expect(action.zone).toBe('content');
    }

    const globalActions = getActionsForZone('global');
    expect(globalActions.length).toBeGreaterThan(0);
    for (const action of globalActions) {
      expect(action.zone).toBe('global');
    }
  });
});

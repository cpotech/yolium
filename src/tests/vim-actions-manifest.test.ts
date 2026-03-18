/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { VIM_ACTIONS, getActionsForZone, getActionsByGroup, SHORTCUT_GROUP_ORDER } from '@shared/vim-actions';

describe('VIM_ACTIONS manifest consistency', () => {
  it('should export a non-empty VIM_ACTIONS array', () => {
    expect(Array.isArray(VIM_ACTIONS)).toBe(true);
    expect(VIM_ACTIONS.length).toBeGreaterThanOrEqual(43);
  });

  it('should export at least 80 actions covering all shortcut categories', () => {
    expect(VIM_ACTIONS.length).toBeGreaterThanOrEqual(80);
    const categories = new Set(VIM_ACTIONS.map(a => a.category));
    expect(categories.has('vim')).toBe(true);
    expect(categories.has('electron')).toBe(true);
    expect(categories.has('terminal')).toBe(true);
    expect(categories.has('mouse')).toBe(true);
  });

  it('every action should have a valid category (vim, electron, terminal, mouse)', () => {
    const validCategories = new Set(['vim', 'electron', 'terminal', 'mouse']);
    for (const action of VIM_ACTIONS) {
      expect(validCategories.has(action.category), `action ${action.id} has invalid category '${action.category}'`).toBe(true);
    }
  });

  it('every action should have a non-empty group string', () => {
    for (const action of VIM_ACTIONS) {
      expect(action.group.length, `action ${action.id} has empty group`).toBeGreaterThan(0);
    }
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

  it('every zone in manifest should be a valid VimActionZone', () => {
    const validZones = new Set([
      'sidebar', 'tabs', 'content', 'status-bar', 'schedule', 'global', 'dialog',
      'dialog-sidebar', 'mode', 'electron-tabs', 'electron-app', 'electron-view',
      'terminal', 'mouse',
    ]);
    for (const action of VIM_ACTIONS) {
      expect(validZones.has(action.zone), `action ${action.id} has invalid zone '${action.zone}'`).toBe(true);
    }
  });

  it('every action mode should be NORMAL, INSERT, or ANY', () => {
    const validModes = new Set(['NORMAL', 'INSERT', 'ANY']);
    for (const action of VIM_ACTIONS) {
      expect(validModes.has(action.mode), `action ${action.id} has invalid mode '${action.mode}'`).toBe(true);
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
        const key = pairKey.split(':')[1];
        const isMultiKey = key === 'gg';
        const isAltMapping = ids.some(id => id.endsWith('-alt'));
        expect(isMultiKey || isAltMapping, `duplicate key ${pairKey}: ${ids.join(', ')}`).toBe(true);
      }
    }
  });

  it('manifest should include actions for all zones', () => {
    const zones = new Set(VIM_ACTIONS.map(a => a.zone));
    expect(zones.has('sidebar')).toBe(true);
    expect(zones.has('tabs')).toBe(true);
    expect(zones.has('content')).toBe(true);
    expect(zones.has('status-bar')).toBe(true);
    expect(zones.has('schedule')).toBe(true);
    expect(zones.has('global')).toBe(true);
    expect(zones.has('dialog')).toBe(true);
    expect(zones.has('dialog-sidebar')).toBe(true);
    expect(zones.has('mode')).toBe(true);
    expect(zones.has('electron-tabs')).toBe(true);
    expect(zones.has('electron-app')).toBe(true);
    expect(zones.has('electron-view')).toBe(true);
    expect(zones.has('terminal')).toBe(true);
    expect(zones.has('mouse')).toBe(true);
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

  it('getActionsByGroup should return a Map with entries for every unique group', () => {
    const groupMap = getActionsByGroup();
    expect(groupMap).toBeInstanceOf(Map);

    const allGroups = new Set(VIM_ACTIONS.map(a => a.group));
    for (const group of allGroups) {
      expect(groupMap.has(group), `group '${group}' missing from getActionsByGroup()`).toBe(true);
      expect(groupMap.get(group)!.length).toBeGreaterThan(0);
    }
    // Every entry in the map should correspond to a real group
    for (const [group] of groupMap) {
      expect(allGroups.has(group), `unexpected group '${group}' in getActionsByGroup()`).toBe(true);
    }
  });

  it('SHORTCUT_GROUP_ORDER should contain every group present in VIM_ACTIONS', () => {
    const allGroups = new Set(VIM_ACTIONS.map(a => a.group));
    const orderSet = new Set(SHORTCUT_GROUP_ORDER);
    for (const group of allGroups) {
      expect(orderSet.has(group), `group '${group}' missing from SHORTCUT_GROUP_ORDER`).toBe(true);
    }
  });

  it('SHORTCUT_GROUP_ORDER should not contain groups absent from VIM_ACTIONS', () => {
    const allGroups = new Set(VIM_ACTIONS.map(a => a.group));
    for (const group of SHORTCUT_GROUP_ORDER) {
      expect(allGroups.has(group), `SHORTCUT_GROUP_ORDER contains '${group}' which has no actions`).toBe(true);
    }
  });

  it('manifest should include dialog-sidebar zone with agent shortcuts', () => {
    const dialogSidebarActions = getActionsForZone('dialog-sidebar');
    expect(dialogSidebarActions.length).toBeGreaterThanOrEqual(8);
    const keys = dialogSidebarActions.map(a => a.key);
    expect(keys).toContain('p');
    expect(keys).toContain('c');
    expect(keys).toContain('v');
    expect(keys).toContain('s');
    expect(keys).toContain('D');
    expect(keys).toContain('m');
    expect(keys).toContain('x');
    expect(keys).toContain('d');
  });

  it('manifest should include electron-tabs zone with Ctrl+Shift tab shortcuts', () => {
    const tabActions = getActionsForZone('electron-tabs');
    expect(tabActions.length).toBeGreaterThanOrEqual(4);
    const keys = tabActions.map(a => a.key);
    expect(keys).toContain('Ctrl+Shift+T');
    expect(keys).toContain('Ctrl+Shift+W');
    expect(keys).toContain('Ctrl+Shift+]');
    expect(keys).toContain('Ctrl+Shift+[');
  });

  it('manifest should include mode zone with INSERT/NORMAL transitions', () => {
    const modeActions = getActionsForZone('mode');
    expect(modeActions.length).toBeGreaterThanOrEqual(2);
    const descriptions = modeActions.map(a => a.description);
    expect(descriptions.some(d => d.includes('INSERT'))).toBe(true);
    expect(descriptions.some(d => d.includes('NORMAL'))).toBe(true);
  });

  it('manifest should include mouse zone with Ctrl+Click and Shift+Click', () => {
    const mouseActions = getActionsForZone('mouse');
    expect(mouseActions.length).toBeGreaterThanOrEqual(2);
    const keys = mouseActions.map(a => a.key);
    expect(keys).toContain('Ctrl+Click');
    expect(keys).toContain('Shift+Click');
  });
});

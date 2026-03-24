/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { VIM_ACTIONS, LEADER_GROUPS, getActionsForZone, getActionsByGroup, SHORTCUT_GROUP_ORDER, getLeaderGroupsForZone, getDirectLeaderActions, getGroupedLeaderActions } from '@shared/vim-actions';

describe('VIM_ACTIONS manifest consistency', () => {
  it('should export a non-empty VIM_ACTIONS array', () => {
    expect(Array.isArray(VIM_ACTIONS)).toBe(true);
    expect(VIM_ACTIONS.length).toBeGreaterThanOrEqual(43);
  });

  it('should export at least 80 actions covering all shortcut categories', () => {
    expect(VIM_ACTIONS.length).toBeGreaterThanOrEqual(92);
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
      'dialog-diff', 'dialog-sidebar', 'dialog-log', 'dialog-scroll', 'mode', 'electron-tabs', 'electron-app', 'electron-view',
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

  it('no two actions in the same zone should have the same key (except multi-key, alt keys, or different leader groups)', () => {
    const zoneKeyPairs = new Map<string, { id: string; leaderGroup?: string }[]>();
    for (const action of VIM_ACTIONS) {
      const pairKey = `${action.zone}:${action.key}`;
      if (!zoneKeyPairs.has(pairKey)) {
        zoneKeyPairs.set(pairKey, []);
      }
      zoneKeyPairs.get(pairKey)!.push({ id: action.id, leaderGroup: action.leaderGroup });
    }
    for (const [pairKey, entries] of zoneKeyPairs) {
      if (entries.length > 1) {
        const key = pairKey.split(':')[1];
        const isMultiKey = key === 'gg';
        const isAltMapping = entries.some(e => e.id.endsWith('-alt'));
        // Actions in different leader groups don't conflict
        const leaderGroups = new Set(entries.map(e => e.leaderGroup ?? '__direct__'));
        const allDifferentGroups = leaderGroups.size === entries.length;
        expect(
          isMultiKey || isAltMapping || allDifferentGroups,
          `duplicate key ${pairKey}: ${entries.map(e => e.id).join(', ')}`
        ).toBe(true);
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
    expect(zones.has('dialog-diff')).toBe(true);
    expect(zones.has('dialog-sidebar')).toBe(true);
    expect(zones.has('dialog-log')).toBe(true);
    expect(zones.has('dialog-scroll')).toBe(true);
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

  it('should include merge/PR shortcut actions in the dialog-sidebar zone', () => {
    const sidebarActions = getActionsForZone('dialog-sidebar');
    const mergePrActionIds = [
      'dialog-compare-changes',
      'dialog-rebase',
      'dialog-check-conflicts',
      'dialog-merge-push-pr',
      'dialog-approve-pr',
      'dialog-merge-pr',
      'dialog-open-pr',
    ];
    const expectedKeys: Record<string, string> = {
      'dialog-compare-changes': 'f',
      'dialog-rebase': 'r',
      'dialog-check-conflicts': 'k',
      'dialog-merge-push-pr': 'm',
      'dialog-approve-pr': 'a',
      'dialog-merge-pr': 'w',
      'dialog-open-pr': 'o',
    };
    for (const actionId of mergePrActionIds) {
      const action = sidebarActions.find(a => a.id === actionId);
      expect(action).toBeDefined();
      expect(action?.zone).toBe('dialog-sidebar');
      expect(action?.key).toBe(expectedKeys[actionId]);
    }
  });

  it('should not have key conflicts between merge/PR keys and existing dialog-sidebar keys within the same leader group', () => {
    const sidebarActions = getActionsForZone('dialog-sidebar');
    // Check conflicts within each leader group separately
    const groupKeyMaps = new Map<string, Map<string, string>>();
    for (const action of sidebarActions) {
      const group = action.leaderGroup ?? '__direct__';
      if (!groupKeyMaps.has(group)) {
        groupKeyMaps.set(group, new Map());
      }
      const keyMap = groupKeyMaps.get(group)!;
      const existing = keyMap.get(action.key);
      if (existing) {
        expect(false, `key '${action.key}' conflicts in group '${group}': ${existing} and ${action.id}`).toBe(true);
      }
      keyMap.set(action.key, action.id);
    }
  });

  it('manifest should include agent-resume-sidebar action with key R in dialog-sidebar zone', () => {
    const action = VIM_ACTIONS.find(a => a.id === 'agent-resume-sidebar');
    expect(action).toBeDefined();
    expect(action?.key).toBe('R');
    expect(action?.zone).toBe('dialog-sidebar');
    expect(action?.mode).toBe('NORMAL');
    expect(action?.category).toBe('vim');
    expect(action?.group).toBe('Sidebar Focus (Work Item)');
    expect(action?.description).toContain('Resume');
  });

  it('dialog-sidebar zone should have no key conflicts within leader groups after adding R', () => {
    const sidebarActions = getActionsForZone('dialog-sidebar');
    // Check per leader group
    const groupKeyMaps = new Map<string, Map<string, string>>();
    for (const action of sidebarActions) {
      const group = action.leaderGroup ?? '__direct__';
      if (!groupKeyMaps.has(group)) {
        groupKeyMaps.set(group, new Map());
      }
      const keyMap = groupKeyMaps.get(group)!;
      const existing = keyMap.get(action.key);
      if (existing) {
        expect(false, `key '${action.key}' conflicts in group '${group}': ${existing} and ${action.id}`).toBe(true);
      }
      keyMap.set(action.key, action.id);
    }
    // Specifically verify R is present in agent group
    const agentGroup = groupKeyMaps.get('a')!;
    expect(agentGroup.has('R')).toBe(true);
    expect(agentGroup.get('R')).toBe('agent-resume-sidebar');
  });

  it('should include leader-key action with Space key in global zone', () => {
    const action = VIM_ACTIONS.find(a => a.id === 'leader-key');
    expect(action).toBeDefined();
    expect(action?.key).toBe('Space');
    expect(action?.zone).toBe('global');
    expect(action?.mode).toBe('NORMAL');
    expect(action?.category).toBe('vim');
    expect(action?.group).toBe('Zone Switching');
  });

  it('should include show-shortcuts-dialog action with ? key in global zone', () => {
    const action = VIM_ACTIONS.find(a => a.id === 'show-shortcuts-dialog');
    expect(action).toBeDefined();
    expect(action?.key).toBe('?');
    expect(action?.zone).toBe('global');
    expect(action?.mode).toBe('NORMAL');
    expect(action?.category).toBe('vim');
    expect(action?.group).toBe('Zone Switching');
    expect(action?.description).toContain('shortcut');
  });

  it('manifest should include log-toggle-sidebar action with key l in dialog-sidebar zone', () => {
    const action = VIM_ACTIONS.find(a => a.id === 'log-toggle-sidebar');
    expect(action).toBeDefined();
    expect(action?.key).toBe('l');
    expect(action?.zone).toBe('dialog-sidebar');
    expect(action?.mode).toBe('NORMAL');
    expect(action?.category).toBe('vim');
    expect(action?.group).toBe('Sidebar Focus (Work Item)');
  });

  it('manifest should include dialog-log zone with log navigation actions', () => {
    const logActions = getActionsForZone('dialog-log');
    expect(logActions.length).toBeGreaterThanOrEqual(3);
    const keys = logActions.map(a => a.key);
    expect(keys).toContain('j');
    expect(keys).toContain('k');
    expect(keys).toContain('Escape');
    const ids = logActions.map(a => a.id);
    expect(ids).toContain('log-down');
    expect(ids).toContain('log-up');
    expect(ids).toContain('log-exit');
  });

  it('manifest should include Log Panel Navigation group', () => {
    const groupMap = getActionsByGroup();
    expect(groupMap.has('Log Panel Navigation')).toBe(true);
    const logNavActions = groupMap.get('Log Panel Navigation')!;
    expect(logNavActions.length).toBeGreaterThanOrEqual(3);
  });

  // --- Leader group validation tests ---

  it('should validate all leaderGroup values reference valid LEADER_GROUPS keys', () => {
    const validGroupKeys = new Set(LEADER_GROUPS.map(g => g.key));
    for (const action of VIM_ACTIONS) {
      if (action.leaderGroup) {
        expect(
          validGroupKeys.has(action.leaderGroup),
          `action ${action.id} references invalid leaderGroup '${action.leaderGroup}'`
        ).toBe(true);
      }
    }
  });

  it('should ensure LEADER_GROUPS keys are unique per zone', () => {
    const seen = new Map<string, string>();
    for (const group of LEADER_GROUPS) {
      const pairKey = `${group.zone}:${group.key}`;
      expect(
        !seen.has(pairKey),
        `duplicate LEADER_GROUPS key '${group.key}' in zone '${group.zone}': ${seen.get(pairKey)} and ${group.label}`
      ).toBe(true);
      seen.set(pairKey, group.label);
    }
  });

  it('should ensure no dialog-sidebar action has a key collision within its leaderGroup', () => {
    const sidebarActions = getActionsForZone('dialog-sidebar');
    const groupKeyMap = new Map<string, Map<string, string>>();
    for (const action of sidebarActions) {
      if (!action.leaderGroup) continue;
      if (!groupKeyMap.has(action.leaderGroup)) {
        groupKeyMap.set(action.leaderGroup, new Map());
      }
      const keyMap = groupKeyMap.get(action.leaderGroup)!;
      const existing = keyMap.get(action.key);
      expect(
        !existing,
        `key collision in leaderGroup '${action.leaderGroup}': key '${action.key}' used by ${existing} and ${action.id}`
      ).toBe(true);
      keyMap.set(action.key, action.id);
    }
  });

  it('getLeaderGroupsForZone returns groups only for the specified zone', () => {
    const sidebarGroups = getLeaderGroupsForZone('dialog-sidebar');
    expect(sidebarGroups.length).toBeGreaterThanOrEqual(2);
    for (const group of sidebarGroups) {
      expect(group.zone).toBe('dialog-sidebar');
    }
    // Content zone should have no leader groups
    const contentGroups = getLeaderGroupsForZone('content');
    expect(contentGroups.length).toBe(0);
  });

  it('getDirectLeaderActions returns actions without leaderGroup for dialog-sidebar', () => {
    const directActions = getDirectLeaderActions('dialog-sidebar');
    for (const action of directActions) {
      expect(action.leaderGroup).toBeUndefined();
      expect(action.zone).toBe('dialog-sidebar');
    }
    const directKeys = directActions.map(a => a.key);
    expect(directKeys).toContain('d');
    expect(directKeys).toContain('l');
  });

  it('getGroupedLeaderActions returns actions for a specific group', () => {
    const agentActions = getGroupedLeaderActions('dialog-sidebar', 'a');
    expect(agentActions.length).toBeGreaterThanOrEqual(6);
    for (const action of agentActions) {
      expect(action.leaderGroup).toBe('a');
      expect(action.zone).toBe('dialog-sidebar');
    }
    const gitActions = getGroupedLeaderActions('dialog-sidebar', 'g');
    expect(gitActions.length).toBeGreaterThanOrEqual(5);
    for (const action of gitActions) {
      expect(action.leaderGroup).toBe('g');
    }
  });
});

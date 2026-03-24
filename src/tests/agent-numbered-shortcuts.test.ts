// src/tests/agent-numbered-shortcuts.test.ts
import { describe, it, expect } from 'vitest';
import { VIM_ACTIONS } from '@shared/vim-actions';

describe('agent numbered shortcuts (vim-actions)', () => {
  it('should have 9 agent-N-sidebar entries for keys 1-9 in dialog-sidebar zone', () => {
    const agentSidebarActions = VIM_ACTIONS.filter(
      a => a.zone === 'dialog-sidebar' && /^agent-\d+-sidebar$/.test(a.id)
    );
    expect(agentSidebarActions).toHaveLength(9);

    for (let i = 1; i <= 9; i++) {
      const action = agentSidebarActions.find(a => a.id === `agent-${i}-sidebar`);
      expect(action, `agent-${i}-sidebar should exist`).toBeDefined();
      expect(action!.key).toBe(String(i));
      expect(action!.zone).toBe('dialog-sidebar');
      expect(action!.mode).toBe('NORMAL');
    }
  });

  it('should not have old single-letter agent sidebar entries', () => {
    const oldActions = VIM_ACTIONS.filter(a =>
      ['agent-plan-sidebar', 'agent-code-sidebar', 'agent-verify-sidebar',
       'agent-scout-sidebar', 'agent-design-sidebar', 'agent-marketing-sidebar'].includes(a.id)
    );
    expect(oldActions).toHaveLength(0);
  });

  it('should still have agent-stop-sidebar and agent-resume-sidebar', () => {
    const stop = VIM_ACTIONS.find(a => a.id === 'agent-stop-sidebar');
    const resume = VIM_ACTIONS.find(a => a.id === 'agent-resume-sidebar');
    expect(stop).toBeDefined();
    expect(stop!.key).toBe('x');
    expect(resume).toBeDefined();
    expect(resume!.key).toBe('R');
  });

  it('should not conflict with existing sidebar shortcuts within the same leader group', () => {
    const sidebarActions = VIM_ACTIONS.filter(a => a.zone === 'dialog-sidebar');
    // Group by (key, leaderGroup) — same key at different leader levels is not a conflict
    const keyMap = new Map<string, string[]>();

    for (const action of sidebarActions) {
      const groupKey = `${action.key}:${action.leaderGroup || ''}`;
      const existing = keyMap.get(groupKey) || [];
      existing.push(action.id);
      keyMap.set(groupKey, existing);
    }

    // Each (key, leaderGroup) pair should map to exactly one action
    for (const [groupKey, ids] of keyMap) {
      expect(ids, `Key '${groupKey}' should not have duplicate bindings`).toHaveLength(1);
    }
  });

  it('should have agent numbered entries in leader group a and cycling entries at level 1', () => {
    // Keys 1-3 are used at two different leader levels:
    // - Level 1 (no leaderGroup): cycle provider/model/column
    // - Level 2 (leaderGroup 'a'): agent selection
    const agent1 = VIM_ACTIONS.find(a => a.zone === 'dialog-sidebar' && a.key === '1' && a.leaderGroup === 'a');
    const agent2 = VIM_ACTIONS.find(a => a.zone === 'dialog-sidebar' && a.key === '2' && a.leaderGroup === 'a');
    const agent3 = VIM_ACTIONS.find(a => a.zone === 'dialog-sidebar' && a.key === '3' && a.leaderGroup === 'a');

    expect(agent1!.id).toBe('agent-1-sidebar');
    expect(agent2!.id).toBe('agent-2-sidebar');
    expect(agent3!.id).toBe('agent-3-sidebar');

    // Cycling entries exist at level 1 (no leaderGroup)
    const cycle1 = VIM_ACTIONS.find(a => a.zone === 'dialog-sidebar' && a.key === '1' && !a.leaderGroup);
    const cycle2 = VIM_ACTIONS.find(a => a.zone === 'dialog-sidebar' && a.key === '2' && !a.leaderGroup);
    const cycle3 = VIM_ACTIONS.find(a => a.zone === 'dialog-sidebar' && a.key === '3' && !a.leaderGroup);

    expect(cycle1!.id).toBe('cycle-provider-sidebar');
    expect(cycle2!.id).toBe('cycle-model-sidebar');
    expect(cycle3!.id).toBe('cycle-column-sidebar');
  });

  it('should have number hints description for all 9 agent sidebar actions', () => {
    for (let i = 1; i <= 9; i++) {
      const action = VIM_ACTIONS.find(a => a.id === `agent-${i}-sidebar`);
      expect(action!.description).toContain(`Agent ${i}`);
    }
  });
});

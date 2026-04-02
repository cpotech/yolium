// src/tests/agent-numbered-shortcuts.test.ts
import { describe, it, expect } from 'vitest';
import { VIM_ACTIONS } from '@shared/vim-actions';

describe('agent numbered shortcuts (vim-actions)', () => {
  it('should have 9 agent-N-sidebar entries for keys Ctrl+1-9 in dialog-sidebar zone', () => {
    const agentSidebarActions = VIM_ACTIONS.filter(
      a => a.zone === 'dialog-sidebar' && /^agent-\d+-sidebar$/.test(a.id)
    );
    expect(agentSidebarActions).toHaveLength(9);

    for (let i = 1; i <= 9; i++) {
      const action = agentSidebarActions.find(a => a.id === `agent-${i}-sidebar`);
      expect(action, `agent-${i}-sidebar should exist`).toBeDefined();
      expect(action!.key).toBe(`Ctrl+${i}`);
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

  it('should not have key conflicts in dialog-sidebar zone', () => {
    const sidebarActions = VIM_ACTIONS.filter(a => a.zone === 'dialog-sidebar');
    const keyMap = new Map<string, string[]>();

    for (const action of sidebarActions) {
      const existing = keyMap.get(action.key) || [];
      existing.push(action.id);
      keyMap.set(action.key, existing);
    }

    // Each key should map to exactly one action
    for (const [key, ids] of keyMap) {
      expect(ids, `Key '${key}' should not have duplicate bindings`).toHaveLength(1);
    }
  });

  it('should have number hints description for all 9 agent sidebar actions', () => {
    for (let i = 1; i <= 9; i++) {
      const action = VIM_ACTIONS.find(a => a.id === `agent-${i}-sidebar`);
      expect(action!.description).toContain(`Agent ${i}`);
    }
  });

  it('should have direct cycling entries for 1/2/3 (no leader group)', () => {
    const cycle1 = VIM_ACTIONS.find(a => a.zone === 'dialog-sidebar' && a.key === '1');
    const cycle2 = VIM_ACTIONS.find(a => a.zone === 'dialog-sidebar' && a.key === '2');
    const cycle3 = VIM_ACTIONS.find(a => a.zone === 'dialog-sidebar' && a.key === '3');

    expect(cycle1!.id).toBe('cycle-provider-sidebar');
    expect(cycle2!.id).toBe('cycle-model-sidebar');
    expect(cycle3!.id).toBe('cycle-column-sidebar');
  });

  it('should not have any leaderGroup field on any action', () => {
    const sidebarActions = VIM_ACTIONS.filter(a => a.zone === 'dialog-sidebar');
    for (const action of sidebarActions) {
      expect((action as any).leaderGroup).toBeUndefined();
    }
  });
});

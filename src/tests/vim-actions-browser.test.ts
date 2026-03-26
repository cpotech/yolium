/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { VIM_ACTIONS, LEADER_GROUPS, SHORTCUT_GROUP_ORDER } from '@shared/vim-actions'

describe('VIM_ACTIONS browser entries', () => {
  it('should include browser-toggle action with key b in dialog-sidebar zone', () => {
    const action = VIM_ACTIONS.find(a => a.id === 'browser-toggle')
    expect(action).toBeDefined()
    expect(action!.key).toBe('b')
    expect(action!.zone).toBe('dialog-sidebar')
    expect(action!.mode).toBe('NORMAL')
    expect(action!.category).toBe('vim')
  })

  it('should include browser-reload action in dialog-browser zone', () => {
    const action = VIM_ACTIONS.find(a => a.id === 'browser-reload')
    expect(action).toBeDefined()
    expect(action!.key).toBe('r')
    expect(action!.zone).toBe('dialog-browser')
  })

  it('should include browser-back action in dialog-browser zone', () => {
    const action = VIM_ACTIONS.find(a => a.id === 'browser-back')
    expect(action).toBeDefined()
    expect(action!.key).toBe('h')
    expect(action!.zone).toBe('dialog-browser')
  })

  it('should include browser-forward action in dialog-browser zone', () => {
    const action = VIM_ACTIONS.find(a => a.id === 'browser-forward')
    expect(action).toBeDefined()
    expect(action!.key).toBe('l')
    expect(action!.zone).toBe('dialog-browser')
  })

  it('should include browser-url action in dialog-browser zone', () => {
    const action = VIM_ACTIONS.find(a => a.id === 'browser-url')
    expect(action).toBeDefined()
    expect(action!.key).toBe('u')
    expect(action!.zone).toBe('dialog-browser')
  })

  it('should include browser-exit action in dialog-browser zone', () => {
    const action = VIM_ACTIONS.find(a => a.id === 'browser-exit')
    expect(action).toBeDefined()
    expect(action!.key).toBe('Escape')
    expect(action!.zone).toBe('dialog-browser')
  })

  it('LEADER_GROUPS should NOT include b (browser uses focus mode, not leader group)', () => {
    const bGroup = LEADER_GROUPS.find(g => g.key === 'b')
    expect(bGroup).toBeUndefined()
  })

  it('SHORTCUT_GROUP_ORDER should include Browser Preview', () => {
    expect(SHORTCUT_GROUP_ORDER).toContain('Browser Preview')
  })
})

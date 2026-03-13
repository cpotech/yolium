import { describe, it, expect } from 'vitest'
import { buildContextMenuItems } from '@main/context-menu'

describe('buildContextMenuItems', () => {
  it('should show Copy menu item when text is selected', () => {
    const items = buildContextMenuItems({ selectionText: 'hello', isEditable: false })
    const roles = items.map((i) => i.role ?? i.type)
    expect(roles).toContain('copy')
    expect(roles).not.toContain('cut')
    expect(roles).not.toContain('paste')
  })

  it('should show Cut and Paste menu items when right-clicking an editable field', () => {
    const items = buildContextMenuItems({ selectionText: 'hello', isEditable: true })
    const roles = items.map((i) => i.role ?? i.type)
    expect(roles).toContain('cut')
    expect(roles).toContain('copy')
    expect(roles).toContain('paste')
  })

  it('should not show Cut when right-clicking non-editable content', () => {
    const items = buildContextMenuItems({ selectionText: 'hello', isEditable: false })
    const roles = items.map((i) => i.role ?? i.type)
    expect(roles).not.toContain('cut')
    expect(roles).not.toContain('paste')
  })

  it('should include Select All in the context menu', () => {
    const items = buildContextMenuItems({ selectionText: '', isEditable: false })
    const roles = items.map((i) => i.role ?? i.type)
    expect(roles).toContain('selectAll')
  })

  it('should show Copy when text is selected in non-editable context', () => {
    const items = buildContextMenuItems({ selectionText: 'some text', isEditable: false })
    const roles = items.map((i) => i.role ?? i.type)
    expect(roles).toContain('copy')
    expect(roles).toContain('selectAll')
  })

  it('should not show context menu with only separator when no text is selected and field is not editable', () => {
    const items = buildContextMenuItems({ selectionText: '', isEditable: false })
    // Should only have selectAll, no separator before it since there are no preceding items
    expect(items).toHaveLength(1)
    expect(items[0].role).toBe('selectAll')
  })
})

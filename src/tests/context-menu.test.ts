import { describe, it, expect, vi } from 'vitest'
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

  // Spell check tests
  const mockWebContents = {
    replaceMisspelling: vi.fn(),
    session: {
      addWordToSpellCheckerDictionary: vi.fn(),
    },
  }

  it('should prepend spell check suggestions when misspelledWord is present', () => {
    const items = buildContextMenuItems(
      {
        selectionText: 'teh',
        isEditable: true,
        misspelledWord: 'teh',
        dictionarySuggestions: ['the', 'tea'],
      },
      mockWebContents as any,
    )
    // First items should be suggestions, then separator, then standard items
    expect(items[0].label).toBe('the')
    expect(items[1].label).toBe('tea')
  })

  it('should add separator between spell suggestions and standard menu items', () => {
    const items = buildContextMenuItems(
      {
        selectionText: 'teh',
        isEditable: true,
        misspelledWord: 'teh',
        dictionarySuggestions: ['the'],
      },
      mockWebContents as any,
    )
    // Should have: suggestion, "Add to Dictionary", separator, standard items
    const separatorIndices = items
      .map((item, i) => (item.type === 'separator' ? i : -1))
      .filter(i => i !== -1)
    expect(separatorIndices.length).toBeGreaterThanOrEqual(1)
  })

  it('should not add spell suggestions when misspelledWord is empty', () => {
    const items = buildContextMenuItems(
      {
        selectionText: 'hello',
        isEditable: true,
        misspelledWord: '',
        dictionarySuggestions: [],
      },
      mockWebContents as any,
    )
    // No suggestion labels — just standard roles
    const labels = items.filter(i => i.label && !['cut', 'copy', 'paste', 'selectAll'].includes(i.role as string))
    expect(labels).toHaveLength(0)
  })

  it('should limit spell suggestions to at most 5 items', () => {
    const items = buildContextMenuItems(
      {
        selectionText: 'wrng',
        isEditable: true,
        misspelledWord: 'wrng',
        dictionarySuggestions: ['wrong', 'wring', 'wrung', 'wing', 'ring', 'rang', 'rung'],
      },
      mockWebContents as any,
    )
    const suggestionItems = items.filter(
      i => i.label && i.label !== 'Add to Dictionary' && i.label !== 'No suggestions' && i.type !== 'separator' && !i.role,
    )
    expect(suggestionItems.length).toBeLessThanOrEqual(5)
  })

  it('should include Add to Dictionary option when a word is misspelled', () => {
    const items = buildContextMenuItems(
      {
        selectionText: 'teh',
        isEditable: true,
        misspelledWord: 'teh',
        dictionarySuggestions: ['the'],
      },
      mockWebContents as any,
    )
    const addToDict = items.find(i => i.label === 'Add to Dictionary')
    expect(addToDict).toBeDefined()
  })

  it('should show No suggestions as disabled item when misspelledWord exists but dictionarySuggestions is empty', () => {
    const items = buildContextMenuItems(
      {
        selectionText: 'xyzabc',
        isEditable: true,
        misspelledWord: 'xyzabc',
        dictionarySuggestions: [],
      },
      mockWebContents as any,
    )
    const noSuggestions = items.find(i => i.label === 'No suggestions')
    expect(noSuggestions).toBeDefined()
    expect(noSuggestions?.enabled).toBe(false)
  })
})

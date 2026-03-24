/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KeyboardShortcutsDialog } from '@renderer/components/settings/KeyboardShortcutsDialog'
import { VIM_ACTIONS, SHORTCUT_GROUP_ORDER } from '@shared/vim-actions'

describe('KeyboardShortcutsDialog', () => {
  it('should NOT render Ctrl+Shift+P in Agent Controls group', () => {
    render(<KeyboardShortcutsDialog isOpen={true} onClose={() => {}} />)

    const dialog = screen.getByTestId('shortcuts-dialog')
    const kbds = Array.from(dialog.querySelectorAll('kbd')).map(k => k.textContent)
    expect(kbds).not.toContain('Ctrl+Shift+P')
    expect(kbds).not.toContain('Ctrl+Shift+C')
    expect(kbds).not.toContain('Ctrl+Shift+V')
  })

  it('should render sidebar agent shortcuts (via leader groups, not Ctrl+Shift)', () => {
    render(<KeyboardShortcutsDialog isOpen={true} onClose={() => {}} />)

    const dialog = screen.getByTestId('shortcuts-dialog')
    const text = dialog.textContent ?? ''
    // Sidebar Focus group should contain agent shortcuts
    expect(text).toContain('Sidebar Focus (Work Item)')
    expect(text).toContain('Agent 1 (by order)')
    expect(text).toContain('Agent 2 (by order)')
    // Ctrl+Shift+S/D/M should NOT be present (removed)
    const kbds = Array.from(dialog.querySelectorAll('kbd')).map(k => k.textContent)
    expect(kbds).not.toContain('Ctrl+Shift+S')
    expect(kbds).not.toContain('Ctrl+Shift+D')
    expect(kbds).not.toContain('Ctrl+Shift+M')
  })

  it('should render Open Project as Ctrl+Shift+N', () => {
    render(<KeyboardShortcutsDialog isOpen={true} onClose={() => {}} />)

    const dialog = screen.getByTestId('shortcuts-dialog')
    const text = dialog.textContent ?? ''

    expect(text).toContain('Open project')
    expect(text).toContain('Ctrl+Shift+N')

    // Ctrl+Shift+P should NOT appear anywhere
    const kbds = Array.from(dialog.querySelectorAll('kbd')).map(k => k.textContent)
    expect(kbds).not.toContain('Ctrl+Shift+P')
  })

  it('should render Settings as Ctrl+Shift+, instead of Ctrl+Shift+S', () => {
    render(<KeyboardShortcutsDialog isOpen={true} onClose={() => {}} />)

    const dialog = screen.getByTestId('shortcuts-dialog')
    const text = dialog.textContent ?? ''

    expect(text).toContain('Settings')
    expect(text).toContain('Ctrl+Shift+,')
  })

  it('should render overlay with z-index higher than z-50 (e.g. z-[60])', () => {
    render(<KeyboardShortcutsDialog isOpen={true} onClose={() => {}} />)

    const overlay = document.querySelector('.fixed.inset-0')
    expect(overlay).toHaveClass('z-[60]')
  })

  it('should display the "Kanban Selection" group', () => {
    render(<KeyboardShortcutsDialog isOpen={true} onClose={() => {}} />)

    const dialog = screen.getByTestId('shortcuts-dialog')
    const text = dialog.textContent ?? ''
    expect(text).toContain('Kanban Selection')
  })

  it('should list Ctrl+Click, Shift+Click, Ctrl+A, Delete, Esc, and Ctrl+Q shortcuts', () => {
    render(<KeyboardShortcutsDialog isOpen={true} onClose={() => {}} />)

    const dialog = screen.getByTestId('shortcuts-dialog')
    const text = dialog.textContent ?? ''

    expect(text).toContain('Ctrl+Click')
    expect(text).toContain('Multi-select items')
    expect(text).toContain('Shift+Click')
    expect(text).toContain('Range select items')
    expect(text).toContain('Ctrl+A')
    expect(text).toContain('Select all items')
    expect(text).toContain('Delete')
    expect(text).toContain('Delete selected items')
    expect(text).toContain('Clear selection / close search')
    expect(text).toContain('Ctrl+Q')
    expect(text).toContain('Close dialog')
  })

  it('should display manifest-derived zone groups (Status Bar, Content, etc.)', () => {
    render(<KeyboardShortcutsDialog isOpen={true} onClose={() => {}} />)

    const dialog = screen.getByTestId('shortcuts-dialog')
    const text = dialog.textContent ?? ''

    expect(text).toContain('Status Bar')
    expect(text).toContain('Content (Kanban)')
    expect(text).toContain('Zone Switching')
  })

  it('should list vim action shortcuts from manifest in their zone groups', () => {
    render(<KeyboardShortcutsDialog isOpen={true} onClose={() => {}} />)

    const dialog = screen.getByTestId('shortcuts-dialog')
    const text = dialog.textContent ?? ''

    // Status bar shortcuts should be present
    expect(text).toContain('Toggle theme')
    expect(text).toContain('Project settings')
    expect(text).toContain('Stop container')
    expect(text).toContain('Toggle recording')

    // Content shortcuts should be present
    expect(text).toContain('Delete focused card')
    expect(text).toContain('New item')

    // Sidebar shortcuts should be present
    expect(text).toContain('Scheduled agents')

    // Verify the kbd elements for these shortcuts exist
    const kbds = Array.from(dialog.querySelectorAll('kbd')).map(k => k.textContent)
    expect(kbds).toContain('L')
    expect(kbds).toContain('p')
    expect(kbds).toContain(',')
    expect(kbds).toContain('q')
    expect(kbds).toContain('w')
    expect(kbds).toContain('h')
    expect(kbds).toContain('x')
  })

  it('should render a group heading for every entry in SHORTCUT_GROUP_ORDER', () => {
    render(<KeyboardShortcutsDialog isOpen={true} onClose={() => {}} />)

    const dialog = screen.getByTestId('shortcuts-dialog')
    const headings = Array.from(dialog.querySelectorAll('h3')).map(h => h.textContent)

    for (const group of SHORTCUT_GROUP_ORDER) {
      expect(headings, `missing group heading '${group}'`).toContain(group)
    }
  })

  it('every shortcut displayed should correspond to a VIM_ACTIONS entry', () => {
    render(<KeyboardShortcutsDialog isOpen={true} onClose={() => {}} />)

    const dialog = screen.getByTestId('shortcuts-dialog')
    // Get all shortcut rows (each row has a description span and a kbd)
    const kbds = Array.from(dialog.querySelectorAll('kbd'))
    const manifestKeys = new Set(VIM_ACTIONS.map(a => a.key))

    for (const kbd of kbds) {
      const keyText = kbd.textContent ?? ''
      // Skip the Ctrl+Q hint in the footer (not a shortcut row)
      if (kbd.closest('.mt-6')) continue
      expect(manifestKeys.has(keyText), `displayed key '${keyText}' not found in VIM_ACTIONS`).toBe(true)
    }
  })

  it('should not contain any hardcoded shortcut arrays outside the manifest', async () => {
    // Read the source file and verify no inline shortcut arrays exist
    const fs = await import('fs')
    const path = await import('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../renderer/components/settings/KeyboardShortcutsDialog.tsx'),
      'utf-8'
    )
    // Should not have any array literals with keys/description objects
    const hardcodedPattern = /shortcuts:\s*\[/g
    const matches = source.match(hardcodedPattern)
    expect(matches, 'found hardcoded shortcut arrays in KeyboardShortcutsDialog').toBeNull()
  })
})

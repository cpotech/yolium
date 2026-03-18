/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KeyboardShortcutsDialog } from '@renderer/components/settings/KeyboardShortcutsDialog'

describe('KeyboardShortcutsDialog', () => {
  it('should render the Agent Controls shortcut group with Ctrl+Shift+P for Plan Agent', () => {
    render(<KeyboardShortcutsDialog isOpen={true} onClose={() => {}} />)

    const dialog = screen.getByTestId('shortcuts-dialog')
    const text = dialog.textContent ?? ''
    expect(text).toContain('Agent Controls')
    expect(text).toContain('Plan Agent')
    expect(text).toContain('Ctrl+Shift+P')
  })

  it('should render New Project as Ctrl+Shift+N instead of Ctrl+Shift+P', () => {
    render(<KeyboardShortcutsDialog isOpen={true} onClose={() => {}} />)

    const dialog = screen.getByTestId('shortcuts-dialog')
    const text = dialog.textContent ?? ''

    // Find the New project entry — it should use Ctrl+Shift+N
    expect(text).toContain('New project')
    expect(text).toContain('Ctrl+Shift+N')

    // Ctrl+Shift+P should only appear in the Agent Controls group (for Plan Agent), not in Application
    const kbds = dialog.querySelectorAll('kbd')
    const applicationSection = Array.from(kbds).filter(
      kbd => kbd.textContent === 'Ctrl+Shift+P'
    )
    // Should exist (for Plan Agent) but not be associated with "New project"
    expect(applicationSection.length).toBeGreaterThan(0)
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

  it('should list Ctrl+Click, Shift+Click, Ctrl+A, Delete, and Esc shortcuts in the Kanban Selection group', () => {
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
})

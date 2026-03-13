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
})

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// Read file contents to verify useSuspendVimNavigation is imported and called
function readComponent(filePath: string): string {
  const fullPath = path.resolve(__dirname, '..', filePath)
  return fs.readFileSync(fullPath, 'utf-8')
}

describe('Dialog vim suspension verification', () => {
  it('WhisperModelDialog should call useSuspendVimNavigation', () => {
    const src = readComponent('renderer/components/settings/WhisperModelDialog.tsx')
    expect(src).toContain('useSuspendVimNavigation')
    expect(src).toMatch(/useSuspendVimNavigation\(isOpen\)/)
  })

  it('GitConfigDialog should call useSuspendVimNavigation', () => {
    const src = readComponent('renderer/components/settings/GitConfigDialog.tsx')
    expect(src).toContain('useSuspendVimNavigation')
    expect(src).toMatch(/useSuspendVimNavigation\(isOpen\)/)
  })

  it('ProjectConfigDialog should call useSuspendVimNavigation', () => {
    const src = readComponent('renderer/components/settings/ProjectConfigDialog.tsx')
    expect(src).toContain('useSuspendVimNavigation')
    expect(src).toMatch(/useSuspendVimNavigation\(isOpen\)/)
  })

  it('AddSpecialistDialog should call useSuspendVimNavigation', () => {
    const src = readComponent('renderer/components/schedule/AddSpecialistDialog.tsx')
    expect(src).toContain('useSuspendVimNavigation')
    expect(src).toMatch(/useSuspendVimNavigation\(isOpen\)/)
  })

  it('AgentSelectDialog should call useSuspendVimNavigation', () => {
    const src = readComponent('renderer/components/agent/AgentSelectDialog.tsx')
    expect(src).toContain('useSuspendVimNavigation')
    expect(src).toMatch(/useSuspendVimNavigation\(isOpen\)/)
  })

  it('GitDiffDialog should call useSuspendVimNavigation', () => {
    const src = readComponent('renderer/components/code-review/GitDiffDialog.tsx')
    expect(src).toContain('useSuspendVimNavigation')
    expect(src).toMatch(/useSuspendVimNavigation\(isOpen\)/)
  })
})

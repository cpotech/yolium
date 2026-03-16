import { describe, it, expect, vi } from 'vitest'
import { initSpellChecker } from '@main/services/spellcheck-setup'

describe('initSpellChecker', () => {
  it('should call setSpellCheckerLanguages with en-US by default', () => {
    const mockSession = {
      setSpellCheckerLanguages: vi.fn(),
      availableSpellCheckerLanguages: ['en-US', 'fr'],
    }

    initSpellChecker(mockSession as any)

    expect(mockSession.setSpellCheckerLanguages).toHaveBeenCalledWith(['en-US'])
  })

  it('should return available spell checker languages from session', () => {
    const mockSession = {
      setSpellCheckerLanguages: vi.fn(),
      availableSpellCheckerLanguages: ['en-US', 'fr', 'de'],
    }

    const result = initSpellChecker(mockSession as any)

    expect(result.availableLanguages).toEqual(['en-US', 'fr', 'de'])
  })

  it('should handle empty language list gracefully', () => {
    const mockSession = {
      setSpellCheckerLanguages: vi.fn(),
      availableSpellCheckerLanguages: [],
    }

    const result = initSpellChecker(mockSession as any)

    expect(mockSession.setSpellCheckerLanguages).toHaveBeenCalledWith(['en-US'])
    expect(result.availableLanguages).toEqual([])
  })
})

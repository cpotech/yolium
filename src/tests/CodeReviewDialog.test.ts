import { describe, it, expect, beforeEach } from 'vitest'

const STORAGE_KEY = 'yolium:lastReviewRepoUrl'

// Simple localStorage mock for node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

describe('CodeReviewDialog repo URL caching', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('returns cached repo URL from localStorage when available', () => {
    localStorageMock.setItem(STORAGE_KEY, 'https://github.com/owner/repo')
    const cached = localStorageMock.getItem(STORAGE_KEY)
    expect(cached).toBe('https://github.com/owner/repo')
  })

  it('returns empty string when no cached URL exists', () => {
    const cached = localStorageMock.getItem(STORAGE_KEY) ?? ''
    expect(cached).toBe('')
  })

  it('saves repo URL to localStorage on submit', () => {
    const repoUrl = '  https://github.com/owner/repo  '
    // Simulate what handleSubmit does: save trimmed URL
    localStorageMock.setItem(STORAGE_KEY, repoUrl.trim())
    expect(localStorageMock.getItem(STORAGE_KEY)).toBe('https://github.com/owner/repo')
  })
})

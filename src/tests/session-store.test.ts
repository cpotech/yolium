import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key]
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {}
  }),
}

vi.stubGlobal('localStorage', localStorageMock)

import { saveSession, loadSession, clearSession } from '@main/stores/session-store'

describe('session-store', () => {
  beforeEach(() => {
    localStorageMock.store = {}
    vi.clearAllMocks()
  })

  describe('saveSession', () => {
    it('saves tabs to localStorage', () => {
      const tabs = [{ cwd: '/home/user/project1' }, { cwd: '/home/user/project2' }]
      saveSession(tabs, 0)

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'yolium-session',
        expect.any(String)
      )

      const saved = JSON.parse(localStorageMock.store['yolium-session'])
      expect(saved.tabs).toHaveLength(2)
      expect(saved.activeTabIndex).toBe(0)
    })

    it('only saves cwd from tabs', () => {
      const tabs = [{ cwd: '/path', otherProp: 'ignored' }]
      saveSession(tabs, 0)

      const saved = JSON.parse(localStorageMock.store['yolium-session'])
      expect(saved.tabs[0]).toEqual({ cwd: '/path' })
      expect(saved.tabs[0]).not.toHaveProperty('otherProp')
    })
  })

  describe('loadSession', () => {
    it('returns null when no session exists', () => {
      expect(loadSession()).toBeNull()
    })

    it('loads valid session from localStorage', () => {
      localStorageMock.store['yolium-session'] = JSON.stringify({
        tabs: [{ cwd: '/home/user/project' }],
        activeTabIndex: 0,
      })

      const session = loadSession()
      expect(session).not.toBeNull()
      expect(session?.tabs).toHaveLength(1)
      expect(session?.activeTabIndex).toBe(0)
    })

    it('returns null for invalid JSON', () => {
      localStorageMock.store['yolium-session'] = 'invalid json'
      expect(loadSession()).toBeNull()
    })

    it('returns null if tabs is not an array', () => {
      localStorageMock.store['yolium-session'] = JSON.stringify({
        tabs: 'not an array',
        activeTabIndex: 0,
      })
      expect(loadSession()).toBeNull()
    })
  })

  describe('clearSession', () => {
    it('removes session from localStorage', () => {
      localStorageMock.store['yolium-session'] = 'some data'
      clearSession()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('yolium-session')
    })
  })
})

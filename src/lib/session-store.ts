/**
 * Session persistence for tab state.
 *
 * Stores tab CWDs so they can be restored on app restart.
 * PTY sessions are created fresh on restore (we restore position, not process).
 */

interface PersistedTab {
  cwd: string;
}

interface PersistedSession {
  tabs: PersistedTab[];
  activeTabIndex: number;
}

const STORAGE_KEY = 'yolium-session';

export function saveSession(tabs: { cwd: string }[], activeIndex: number): void {
  const session: PersistedSession = {
    tabs: tabs.map(t => ({ cwd: t.cwd })),
    activeTabIndex: activeIndex,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('Failed to save session:', e);
  }
}

export function loadSession(): PersistedSession | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const session = JSON.parse(stored) as PersistedSession;
    // Validate structure
    if (!Array.isArray(session.tabs)) return null;
    return session;
  } catch (e) {
    console.warn('Failed to load session:', e);
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

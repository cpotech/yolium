import type { ThemeTokens } from '../../types/theme';

export const lightTheme: ThemeTokens = {
  colors: {
    bg: {
      primary: '#f8fafc',     // slate-50 - Main background
      secondary: '#e2e8f0',   // slate-200 - Panels, status bar
      tertiary: '#cbd5e1',    // slate-300 - Cards, active tabs
      hover: '#94a3b8',       // slate-400 - Hover states
      terminal: '#1e293b',    // slate-800 - Terminal (keep dark)
      overlay: 'rgba(0, 0, 0, 0.5)', // Modal overlays
    },
    text: {
      primary: '#0f172a',     // slate-900 - Primary text
      secondary: '#475569',   // slate-600 - Secondary labels
      muted: '#94a3b8',       // slate-400 - Placeholders, hints
      disabled: '#cbd5e1',    // slate-300 - Disabled text
    },
    border: {
      primary: '#cbd5e1',     // slate-300 - Primary borders
      secondary: '#94a3b8',   // slate-400 - Secondary/hover
      focus: '#3b82f6',       // blue-500 - Focus rings
    },
    accent: {
      primary: '#2563eb',     // blue-600 - Primary actions
      hover: '#3b82f6',       // blue-500 - Hover on accent
    },
    status: {
      success: '#22c55e',     // green-500 - Running, success
      warning: '#eab308',     // yellow-500 - Starting, warning
      error: '#ef4444',       // red-500 - Crashed, error
      stopped: '#64748b',     // slate-500 - Stopped state
    },
    special: {
      worktree: '#a855f7',    // purple-500 - Worktree indicator
      branch: '#3b82f6',      // blue-500 - Git branch
    },
  },
  terminal: {
    background: '#1e293b',    // Keep terminal dark for readability
    foreground: '#f8fafc',
    cursor: '#f8fafc',
    black: '#1e293b',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#facc15',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#f8fafc',
    brightBlack: '#475569',
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fde047',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff',
  },
};

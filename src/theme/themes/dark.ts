import type { ThemeTokens } from '../../types/theme';

export const darkTheme: ThemeTokens = {
  colors: {
    bg: {
      primary: '#0f172a',     // slate-900 - Main background
      secondary: '#1e293b',   // slate-800 - Panels, status bar
      tertiary: '#334155',    // slate-700 - Elevated cards, active tabs
      hover: '#475569',       // slate-600 - Hover states
      terminal: '#0a0a0a',    // Near black - Terminal background
      overlay: 'rgba(0, 0, 0, 0.7)', // Modal overlays
    },
    text: {
      primary: '#f8fafc',     // slate-50 - Primary text
      secondary: '#cbd5e1',   // slate-300 - Secondary labels
      muted: '#64748b',       // slate-500 - Placeholders, hints
      disabled: '#475569',    // slate-600 - Disabled text
    },
    border: {
      primary: '#334155',     // slate-700 - Primary borders
      secondary: '#475569',   // slate-600 - Secondary/hover
      focus: '#3b82f6',       // blue-500 - Focus rings
    },
    accent: {
      primary: '#3b82f6',     // blue-500 - Primary actions
      hover: '#60a5fa',       // blue-400 - Hover on accent
    },
    status: {
      success: '#4ade80',     // green-400 - Running, success
      warning: '#facc15',     // yellow-400 - Starting, warning
      error: '#f87171',       // red-400 - Crashed, error
      stopped: '#94a3b8',     // slate-400 - Stopped state
    },
    special: {
      worktree: '#c084fc',    // purple-400 - Worktree indicator
      branch: '#60a5fa',      // blue-400 - Git branch
    },
  },
  terminal: {
    background: '#0a0a0a',
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

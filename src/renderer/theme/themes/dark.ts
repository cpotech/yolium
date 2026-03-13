import type { ThemeTokens } from '@shared/types/theme';

export const darkTheme: ThemeTokens = {
  colors: {
    bg: {
      primary: '#11121D',     // tokyodark bg0 - Main background
      secondary: '#1A1B2A',   // tokyodark bg1 - Panels, status bar
      tertiary: '#212234',    // tokyodark bg2 - Elevated cards, active tabs
      hover: '#353945',       // tokyodark bg3 - Hover states
      terminal: '#06080A',    // tokyodark black - Terminal background
      overlay: 'rgba(6, 8, 10, 0.7)', // Based on tokyodark black
    },
    text: {
      primary: '#A0A8CD',     // tokyodark fg - Primary text
      secondary: '#717CB4',   // Dimmed fg - Secondary labels
      tertiary: '#5A6070',    // Between secondary and muted - Subtle labels
      muted: '#4A5057',       // tokyodark grey/bg4 - Placeholders, hints
      disabled: '#353945',    // tokyodark bg3 - Disabled text
    },
    border: {
      primary: '#282C34',     // tokyodark bg5 - Primary borders
      secondary: '#353945',   // tokyodark bg3 - Secondary/hover
      focus: '#7199EE',       // tokyodark blue - Focus rings
    },
    accent: {
      primary: '#7199EE',     // tokyodark blue - Primary actions
      hover: '#9FBBF3',       // tokyodark bg_blue - Hover on accent
    },
    status: {
      success: '#95C561',     // tokyodark green - Running, success
      warning: '#D7A65F',     // tokyodark yellow - Starting, warning
      error: '#EE6D85',       // tokyodark red - Crashed, error
      stopped: '#4A5057',     // tokyodark grey - Stopped state
      info: '#7199EE',        // tokyodark blue - Info, unmerged
    },
    special: {
      worktree: '#A485DD',    // tokyodark purple - Worktree indicator
      branch: '#7199EE',      // tokyodark blue - Git branch
    },
    agent: {
      primary: { bg: '#7199EE', hover: '#9FBBF3' },   // accent blue
      danger: { bg: '#EE6D85', hover: '#FE6D85' },    // red - semantic meaning
      success: { bg: '#5A7FD4', hover: '#7199EE' },   // deeper blue
      warning: { bg: '#4A6FC7', hover: '#5A7FD4' },   // muted blue
    },
  },
  terminal: {
    background: '#06080A',    // tokyodark black
    foreground: '#A0A8CD',    // tokyodark fg
    cursor: '#A0A8CD',        // tokyodark fg
    black: '#1A1B2A',         // tokyodark bg1
    red: '#EE6D85',           // tokyodark red
    green: '#95C561',         // tokyodark green
    yellow: '#D7A65F',        // tokyodark yellow
    blue: '#7199EE',          // tokyodark blue
    magenta: '#A485DD',       // tokyodark purple
    cyan: '#38A89D',          // tokyodark cyan
    white: '#A0A8CD',         // tokyodark fg
    brightBlack: '#4A5057',   // tokyodark bg4
    brightRed: '#FE6D85',     // tokyodark bg_red
    brightGreen: '#98C379',   // tokyodark bg_green
    brightYellow: '#F6955B',  // tokyodark orange
    brightBlue: '#9FBBF3',    // tokyodark bg_blue
    brightMagenta: '#BDA5E8', // Lighter purple
    brightCyan: '#5BC0B0',    // Lighter cyan
    brightWhite: '#D5D8DF',   // Brighter fg
  },
};

import type { ThemeTokens } from '@shared/types/theme';

export const lightTheme: ThemeTokens = {
  colors: {
    bg: {
      primary: '#E8E9ED',     // Light blue-grey - Main background
      secondary: '#D5D7DD',   // Slightly deeper - Panels, status bar
      tertiary: '#C4C6CE',    // Mid-tone - Elevated cards, active tabs
      hover: '#B5B7C0',       // Hover states
      terminal: '#11121D',    // tokyodark bg0 - Terminal stays dark
      overlay: 'rgba(17, 18, 29, 0.5)', // Based on tokyodark bg0
    },
    text: {
      primary: '#11121D',     // tokyodark bg0 - Primary text
      secondary: '#353945',   // tokyodark bg3 - Secondary labels
      tertiary: '#555A66',    // Between secondary and muted - Subtle labels
      muted: '#6B6F7B',       // Medium grey - Placeholders, hints
      disabled: '#B5B7C0',    // Light grey - Disabled text
    },
    border: {
      primary: '#C4C6CE',     // Mid-tone - Primary borders
      secondary: '#B5B7C0',   // Hover tone - Secondary/hover
      focus: '#7199EE',       // tokyodark blue - Focus rings
    },
    accent: {
      primary: '#5A7FD4',     // Deeper blue for contrast on light bg
      hover: '#7199EE',       // tokyodark blue - Hover on accent
    },
    status: {
      success: '#6FA040',     // Darker green for light bg contrast
      warning: '#B8883F',     // Darker yellow for light bg contrast
      error: '#D05070',       // Darker red for light bg contrast
      stopped: '#6B6F7B',     // Medium grey - Stopped state
      info: '#5A7FD4',        // Deeper blue for light bg - Info, unmerged
    },
    special: {
      worktree: '#8B6BBE',    // Deeper purple for light bg
      branch: '#5A7FD4',      // Deeper blue for light bg
    },
    agent: {
      primary: { bg: '#5A7FD4', hover: '#7199EE' },   // deeper blue for contrast
      danger: { bg: '#D05070', hover: '#EE6D85' },    // darker red for light bg
      success: { bg: '#4A6FC7', hover: '#5A7FD4' },   // muted blue
      warning: { bg: '#3D5EB8', hover: '#4A6FC7' },   // deeper muted blue
    },
  },
  terminal: {
    background: '#11121D',    // tokyodark bg0 - Terminal stays dark
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

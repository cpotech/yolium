/**
 * Theme token type definitions for Yolium
 */

export type ThemeTokens = {
  colors: {
    bg: {
      primary: string;
      secondary: string;
      tertiary: string;
      hover: string;
      terminal: string;
      overlay: string;
    };
    text: {
      primary: string;
      secondary: string;
      tertiary: string;
      muted: string;
      disabled: string;
    };
    border: {
      primary: string;
      secondary: string;
      focus: string;
    };
    accent: {
      primary: string;
      hover: string;
    };
    status: {
      success: string;
      warning: string;
      error: string;
      stopped: string;
      info: string;
    };
    special: {
      worktree: string;
      branch: string;
    };
    agent: {
      primary: { bg: string; hover: string };
      danger: { bg: string; hover: string };
      success: { bg: string; hover: string };
      warning: { bg: string; hover: string };
    };
  };
  terminal: {
    background: string;
    foreground: string;
    cursor: string;
    // ANSI colors
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
};

export type ThemeName = 'dark' | 'light';

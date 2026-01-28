import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ThemeName, ThemeTokens } from './tokens';
import { darkTheme } from './themes/dark';
import { lightTheme } from './themes/light';

const STORAGE_KEY = 'yolium:theme';

interface ThemeContextValue {
  theme: ThemeName;
  tokens: ThemeTokens;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const themes: Record<ThemeName, ThemeTokens> = {
  dark: darkTheme,
  light: lightTheme,
};

/**
 * Get initial theme from localStorage
 */
function getInitialTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // localStorage may not be available
  }
  return 'dark'; // Default to dark theme
}

/**
 * Generate CSS custom properties from theme tokens
 */
function generateCSSVariables(tokens: ThemeTokens): Record<string, string> {
  const { colors } = tokens;
  return {
    '--color-bg-primary': colors.bg.primary,
    '--color-bg-secondary': colors.bg.secondary,
    '--color-bg-tertiary': colors.bg.tertiary,
    '--color-bg-hover': colors.bg.hover,
    '--color-bg-terminal': colors.bg.terminal,
    '--color-bg-overlay': colors.bg.overlay,
    '--color-text-primary': colors.text.primary,
    '--color-text-secondary': colors.text.secondary,
    '--color-text-muted': colors.text.muted,
    '--color-text-disabled': colors.text.disabled,
    '--color-border-primary': colors.border.primary,
    '--color-border-secondary': colors.border.secondary,
    '--color-border-focus': colors.border.focus,
    '--color-accent-primary': colors.accent.primary,
    '--color-accent-hover': colors.accent.hover,
    '--color-status-success': colors.status.success,
    '--color-status-warning': colors.status.warning,
    '--color-status-error': colors.status.error,
    '--color-status-stopped': colors.status.stopped,
    '--color-special-worktree': colors.special.worktree,
    '--color-special-branch': colors.special.branch,
  };
}

/**
 * Apply theme to DOM (set data attribute and CSS variables)
 */
function applyThemeToDOM(theme: ThemeName, tokens: ThemeTokens): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);

  const variables = generateCSSVariables(tokens);
  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(getInitialTheme);

  const tokens = themes[theme];

  const setTheme = useCallback((newTheme: ThemeName) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // localStorage may not be available
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  useEffect(() => {
    applyThemeToDOM(theme, tokens);
  }, [theme, tokens]);

  return (
    <ThemeContext.Provider value={{ theme, tokens, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

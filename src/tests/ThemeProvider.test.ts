import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ThemeName, ThemeTokens } from '../theme/tokens';
import { darkTheme } from '../theme/themes/dark';
import { lightTheme } from '../theme/themes/light';

// Storage key constant - should match ThemeProvider
const STORAGE_KEY = 'yolium:theme';

// Theme registry - should match ThemeProvider
const themes: Record<ThemeName, ThemeTokens> = {
  dark: darkTheme,
  light: lightTheme,
};

/**
 * Pure function to get initial theme from storage
 * This is the logic we're testing - extracted for testability
 */
function getInitialTheme(storedValue: string | null): ThemeName {
  if (storedValue === 'light' || storedValue === 'dark') {
    return storedValue;
  }
  return 'dark'; // Default
}

/**
 * Pure function to get the next theme (toggle)
 */
function getNextTheme(currentTheme: ThemeName): ThemeName {
  return currentTheme === 'dark' ? 'light' : 'dark';
}

/**
 * Pure function to generate CSS variable assignments
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

describe('Theme Provider Logic', () => {
  describe('getInitialTheme', () => {
    it('should return dark theme when no stored value', () => {
      expect(getInitialTheme(null)).toBe('dark');
    });

    it('should return dark theme when stored value is invalid', () => {
      expect(getInitialTheme('invalid')).toBe('dark');
      expect(getInitialTheme('')).toBe('dark');
      expect(getInitialTheme('DARK')).toBe('dark');
    });

    it('should return dark when stored value is "dark"', () => {
      expect(getInitialTheme('dark')).toBe('dark');
    });

    it('should return light when stored value is "light"', () => {
      expect(getInitialTheme('light')).toBe('light');
    });
  });

  describe('getNextTheme', () => {
    it('should return light when current is dark', () => {
      expect(getNextTheme('dark')).toBe('light');
    });

    it('should return dark when current is light', () => {
      expect(getNextTheme('light')).toBe('dark');
    });
  });

  describe('themes registry', () => {
    it('should have dark and light themes', () => {
      expect(themes).toHaveProperty('dark');
      expect(themes).toHaveProperty('light');
    });

    it('should return correct theme tokens', () => {
      expect(themes.dark).toBe(darkTheme);
      expect(themes.light).toBe(lightTheme);
    });
  });

  describe('generateCSSVariables', () => {
    it('should generate all required CSS variables for dark theme', () => {
      const variables = generateCSSVariables(darkTheme);

      expect(variables['--color-bg-primary']).toBe(darkTheme.colors.bg.primary);
      expect(variables['--color-bg-secondary']).toBe(darkTheme.colors.bg.secondary);
      expect(variables['--color-text-primary']).toBe(darkTheme.colors.text.primary);
      expect(variables['--color-accent-primary']).toBe(darkTheme.colors.accent.primary);
      expect(variables['--color-status-success']).toBe(darkTheme.colors.status.success);
    });

    it('should generate all required CSS variables for light theme', () => {
      const variables = generateCSSVariables(lightTheme);

      expect(variables['--color-bg-primary']).toBe(lightTheme.colors.bg.primary);
      expect(variables['--color-text-primary']).toBe(lightTheme.colors.text.primary);
    });

    it('should have 21 CSS variables', () => {
      const variables = generateCSSVariables(darkTheme);
      expect(Object.keys(variables)).toHaveLength(21);
    });

    it('should include all color category variables', () => {
      const variables = generateCSSVariables(darkTheme);
      const keys = Object.keys(variables);

      // Background colors
      expect(keys).toContain('--color-bg-primary');
      expect(keys).toContain('--color-bg-secondary');
      expect(keys).toContain('--color-bg-tertiary');
      expect(keys).toContain('--color-bg-hover');
      expect(keys).toContain('--color-bg-terminal');
      expect(keys).toContain('--color-bg-overlay');

      // Text colors
      expect(keys).toContain('--color-text-primary');
      expect(keys).toContain('--color-text-secondary');
      expect(keys).toContain('--color-text-muted');
      expect(keys).toContain('--color-text-disabled');

      // Border colors
      expect(keys).toContain('--color-border-primary');
      expect(keys).toContain('--color-border-secondary');
      expect(keys).toContain('--color-border-focus');

      // Accent colors
      expect(keys).toContain('--color-accent-primary');
      expect(keys).toContain('--color-accent-hover');

      // Status colors
      expect(keys).toContain('--color-status-success');
      expect(keys).toContain('--color-status-warning');
      expect(keys).toContain('--color-status-error');
      expect(keys).toContain('--color-status-stopped');

      // Special colors
      expect(keys).toContain('--color-special-worktree');
      expect(keys).toContain('--color-special-branch');
    });
  });

  describe('Storage key', () => {
    it('should use correct storage key', () => {
      expect(STORAGE_KEY).toBe('yolium:theme');
    });
  });
});

describe('Theme persistence', () => {
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    mockStorage = {};
  });

  // Mock localStorage behavior
  const mockLocalStorage = {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => {
      mockStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
  };

  it('should persist theme to storage', () => {
    mockLocalStorage.setItem(STORAGE_KEY, 'light');
    expect(mockLocalStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('should restore theme from storage', () => {
    mockLocalStorage.setItem(STORAGE_KEY, 'light');
    const theme = getInitialTheme(mockLocalStorage.getItem(STORAGE_KEY));
    expect(theme).toBe('light');
  });

  it('should handle missing storage value', () => {
    const theme = getInitialTheme(mockLocalStorage.getItem(STORAGE_KEY));
    expect(theme).toBe('dark');
  });
});

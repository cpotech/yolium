import { describe, it, expect } from 'vitest';
import type { ThemeTokens, ThemeName } from '../types/theme';
import { darkTheme } from '../theme/themes/dark';
import { lightTheme } from '../theme/themes/light';

describe('Theme Tokens', () => {
  describe('ThemeTokens structure', () => {
    it('should have required color categories', () => {
      const requiredCategories = ['bg', 'text', 'border', 'accent', 'status', 'special'];

      requiredCategories.forEach(category => {
        expect(darkTheme.colors).toHaveProperty(category);
        expect(lightTheme.colors).toHaveProperty(category);
      });
    });

    it('should have all required bg tokens', () => {
      const requiredBg = ['primary', 'secondary', 'tertiary', 'hover', 'terminal', 'overlay'];

      requiredBg.forEach(token => {
        expect(darkTheme.colors.bg).toHaveProperty(token);
        expect(lightTheme.colors.bg).toHaveProperty(token);
      });
    });

    it('should have all required text tokens', () => {
      const requiredText = ['primary', 'secondary', 'muted', 'disabled'];

      requiredText.forEach(token => {
        expect(darkTheme.colors.text).toHaveProperty(token);
        expect(lightTheme.colors.text).toHaveProperty(token);
      });
    });

    it('should have all required border tokens', () => {
      const requiredBorder = ['primary', 'secondary', 'focus'];

      requiredBorder.forEach(token => {
        expect(darkTheme.colors.border).toHaveProperty(token);
        expect(lightTheme.colors.border).toHaveProperty(token);
      });
    });

    it('should have all required accent tokens', () => {
      const requiredAccent = ['primary', 'hover'];

      requiredAccent.forEach(token => {
        expect(darkTheme.colors.accent).toHaveProperty(token);
        expect(lightTheme.colors.accent).toHaveProperty(token);
      });
    });

    it('should have all required status tokens', () => {
      const requiredStatus = ['success', 'warning', 'error', 'stopped'];

      requiredStatus.forEach(token => {
        expect(darkTheme.colors.status).toHaveProperty(token);
        expect(lightTheme.colors.status).toHaveProperty(token);
      });
    });

    it('should have all required special tokens', () => {
      const requiredSpecial = ['worktree', 'branch'];

      requiredSpecial.forEach(token => {
        expect(darkTheme.colors.special).toHaveProperty(token);
        expect(lightTheme.colors.special).toHaveProperty(token);
      });
    });

    it('should have terminal theme configuration', () => {
      const requiredTerminal = [
        'background', 'foreground', 'cursor',
        'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
        'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
        'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'
      ];

      requiredTerminal.forEach(token => {
        expect(darkTheme.terminal).toHaveProperty(token);
        expect(lightTheme.terminal).toHaveProperty(token);
      });
    });
  });

  describe('Color values', () => {
    it('should have valid hex color format for all color tokens', () => {
      const hexOrRgbaRegex = /^#[0-9a-fA-F]{6}$|^rgba?\(/;

      const validateColors = (obj: Record<string, unknown>, path = ''): void => {
        Object.entries(obj).forEach(([key, value]) => {
          if (typeof value === 'string') {
            expect(value, `${path}.${key}`).toMatch(hexOrRgbaRegex);
          } else if (typeof value === 'object' && value !== null) {
            validateColors(value as Record<string, unknown>, `${path}.${key}`);
          }
        });
      };

      validateColors(darkTheme.colors, 'darkTheme.colors');
      validateColors(lightTheme.colors, 'lightTheme.colors');
      validateColors(darkTheme.terminal, 'darkTheme.terminal');
      validateColors(lightTheme.terminal, 'lightTheme.terminal');
    });

    it('dark theme should have dark background colors', () => {
      // Dark backgrounds should have low luminance (first hex digit 0-5)
      const bgPrimary = darkTheme.colors.bg.primary;
      expect(bgPrimary).toMatch(/^#[0-5]/);
    });

    it('light theme should have light background colors', () => {
      // Light backgrounds should have high luminance (first hex digit 8-f)
      const bgPrimary = lightTheme.colors.bg.primary;
      expect(bgPrimary).toMatch(/^#[8-9a-fA-F]/);
    });

    it('dark theme text should be light colored', () => {
      const textPrimary = darkTheme.colors.text.primary;
      expect(textPrimary).toMatch(/^#[a-fA-F]/);
    });

    it('light theme text should be dark colored', () => {
      const textPrimary = lightTheme.colors.text.primary;
      expect(textPrimary).toMatch(/^#[0-4]/);
    });
  });

  describe('Terminal theme', () => {
    it('terminal should always have dark background for readability', () => {
      // Even in light mode, terminal stays dark for readability
      expect(darkTheme.terminal.background).toMatch(/^#[0-2]/);
      expect(lightTheme.terminal.background).toMatch(/^#[0-3]/);
    });

    it('terminal foreground should be light for contrast', () => {
      expect(darkTheme.terminal.foreground).toMatch(/^#[a-fA-F]/);
      expect(lightTheme.terminal.foreground).toMatch(/^#[a-fA-F]/);
    });
  });
});

describe('ThemeName', () => {
  it('should support dark and light theme names', () => {
    const validThemes: ThemeName[] = ['dark', 'light'];
    expect(validThemes).toContain('dark');
    expect(validThemes).toContain('light');
    expect(validThemes).toHaveLength(2);
  });
});

/**
 * Tests for PAT (Personal Access Token) validation logic
 *
 * Reimplements the validatePat function from GitConfigDialog.tsx
 * to test validation rules independently.
 */

import { describe, it, expect } from 'vitest';

// Reimplement validatePat to match the logic in GitConfigDialog.tsx
function validatePat(value: string): { valid: boolean; error?: string } {
  if (!value.trim()) return { valid: true };
  const trimmed = value.trim();
  if (!trimmed.startsWith('github_pat_') && !trimmed.startsWith('ghp_')) {
    return { valid: false, error: 'Token must start with "github_pat_" or "ghp_"' };
  }
  if (/[@:\/]/.test(trimmed)) {
    return { valid: false, error: 'Paste only the token, not a URL (remove @github.com or similar)' };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return { valid: false, error: 'Token should only contain letters, numbers, underscores, and hyphens' };
  }
  return { valid: true };
}

describe('PAT validation', () => {
  it('should accept empty string (PAT is optional)', () => {
    expect(validatePat('')).toEqual({ valid: true });
    expect(validatePat('  ')).toEqual({ valid: true });
  });

  it('should accept github_pat_ tokens', () => {
    expect(validatePat('github_pat_11ABC123xyz')).toEqual({ valid: true });
  });

  it('should accept ghp_ tokens', () => {
    expect(validatePat('ghp_ABC123xyz789')).toEqual({ valid: true });
  });

  it('should accept tokens with hyphens', () => {
    expect(validatePat('github_pat_11ABC-123-xyz')).toEqual({ valid: true });
    expect(validatePat('ghp_ABC-123-xyz')).toEqual({ valid: true });
  });

  it('should reject tokens with @ character', () => {
    const result = validatePat('github_pat_abc@github.com');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('URL');
  });

  it('should reject tokens with : character', () => {
    const result = validatePat('github_pat_abc:def');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('URL');
  });

  it('should reject tokens with / character', () => {
    const result = validatePat('github_pat_abc/def');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('URL');
  });

  it('should reject tokens with wrong prefix', () => {
    const result = validatePat('gho_ABC123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('github_pat_');
  });
});

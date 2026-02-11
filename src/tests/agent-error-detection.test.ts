import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { detectErrorInOutput } from '@main/docker/agent-container';

describe('detectErrorInOutput', () => {
  describe('should return undefined for Claude provider', () => {
    it('returns undefined even with error patterns', () => {
      const text = 'Error: 401 Unauthorized';
      expect(detectErrorInOutput(text, 'claude')).toBeUndefined();
    });

    it('returns undefined when provider is not specified', () => {
      const text = 'Error: Something went wrong';
      expect(detectErrorInOutput(text)).toBeUndefined();
    });

    it('returns undefined when provider is empty string', () => {
      const text = 'Error: Something went wrong';
      expect(detectErrorInOutput(text, '')).toBeUndefined();
    });
  });

  describe('should detect auth errors (401)', () => {
    it('detects "401 Unauthorized" in Codex output', () => {
      const text = 'Request failed: 401 Unauthorized - Invalid API key';
      expect(detectErrorInOutput(text, 'codex')).toBe('Authentication failed (401 Unauthorized)');
    });

    it('detects "Missing bearer authentication" pattern', () => {
      const text = 'Error: Missing bearer authentication. Please provide a valid token.';
      expect(detectErrorInOutput(text, 'codex')).toBe('Authentication failed (401 Unauthorized)');
    });

    it('detects auth errors for OpenCode provider', () => {
      const text = '401 Unauthorized';
      expect(detectErrorInOutput(text, 'opencode')).toBe('Authentication failed (401 Unauthorized)');
    });
  });

  describe('should detect rate limit errors (429)', () => {
    it('detects "429 Too Many Requests"', () => {
      const text = 'API Error: 429 Too Many Requests. Retry after 30 seconds.';
      expect(detectErrorInOutput(text, 'codex')).toBe('Rate limit exceeded (429 Too Many Requests)');
    });

    it('detects "rate limit" text', () => {
      const text = 'You have exceeded the rate limit. Please slow down.';
      expect(detectErrorInOutput(text, 'codex')).toBe('Rate limit exceeded (429 Too Many Requests)');
    });

    it('detects rate limit errors case-insensitively', () => {
      const text = 'RATE LIMIT exceeded';
      expect(detectErrorInOutput(text, 'opencode')).toBe('Rate limit exceeded (429 Too Many Requests)');
    });
  });

  describe('should detect API overload errors (503)', () => {
    it('detects "overloaded" message', () => {
      const text = 'The API is currently overloaded. Please try again later.';
      expect(detectErrorInOutput(text, 'codex')).toBe('API overloaded (503 Service Unavailable)');
    });

    it('detects "503 Service" pattern', () => {
      const text = '503 Service Temporarily Unavailable';
      expect(detectErrorInOutput(text, 'codex')).toBe('API overloaded (503 Service Unavailable)');
    });
  });

  describe('should detect network errors', () => {
    it('detects ECONNREFUSED', () => {
      const text = 'Error: connect ECONNREFUSED 127.0.0.1:443';
      expect(detectErrorInOutput(text, 'codex')).toBe('Network error (connection failed)');
    });

    it('detects ENOTFOUND', () => {
      const text = 'getaddrinfo ENOTFOUND api.openai.com';
      expect(detectErrorInOutput(text, 'codex')).toBe('Network error (connection failed)');
    });

    it('detects "network error" text', () => {
      const text = 'A network error occurred. Check your connection.';
      expect(detectErrorInOutput(text, 'opencode')).toBe('Network error (connection failed)');
    });

    it('detects "connection refused" text', () => {
      const text = 'Connection refused by server';
      expect(detectErrorInOutput(text, 'codex')).toBe('Network error (connection failed)');
    });
  });

  describe('should detect Codex CLI errors', () => {
    it('detects generic "Error:" prefix', () => {
      const text = 'Error: Something went wrong with the request';
      expect(detectErrorInOutput(text, 'codex')).toBe('Codex error: Something went wrong with the request');
    });

    it('extracts error message after "Error:"', () => {
      const text = 'Error: Invalid model specified';
      expect(detectErrorInOutput(text, 'codex')).toBe('Codex error: Invalid model specified');
    });
  });

  describe('should return undefined for normal output', () => {
    it('returns undefined for successful tool execution', () => {
      const text = '[Read] src/main.ts - File contents loaded successfully';
      expect(detectErrorInOutput(text, 'codex')).toBeUndefined();
    });

    it('returns undefined for normal progress messages', () => {
      const text = 'Processing your request...';
      expect(detectErrorInOutput(text, 'codex')).toBeUndefined();
    });

    it('returns undefined for multi-line normal output', () => {
      const text = `Looking at the codebase...
Found 3 files to modify
Starting edits now`;
      expect(detectErrorInOutput(text, 'opencode')).toBeUndefined();
    });
  });

  describe('should handle edge cases', () => {
    it('returns undefined for empty text', () => {
      expect(detectErrorInOutput('', 'codex')).toBeUndefined();
    });

    it('returns undefined for whitespace-only text', () => {
      expect(detectErrorInOutput('   \n\t  ', 'codex')).toBeUndefined();
    });

    it('detects first error when multiple errors present', () => {
      const text = 'Rate limit exceeded (429 Too Many Requests). Error: Please try again.';
      // Should match rate limit first since it's earlier in the text
      expect(detectErrorInOutput(text, 'codex')).toBe('Rate limit exceeded (429 Too Many Requests)');
    });

    it('handles mixed case patterns', () => {
      const text = 'ERROR: Network timeout';
      expect(detectErrorInOutput(text, 'codex')).toBe('Codex error: Network timeout');
    });
  });
});

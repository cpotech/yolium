// src/tests/email-tools.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));

import { resolveToolDir } from '@main/services/tools-resolver';

describe('email tools', () => {
  const toolsDir = path.join(__dirname, '..', 'tools', 'email');

  it('should have _imap.py helper in src/tools/email/', () => {
    const realFs = require('node:fs');
    expect(realFs.existsSync(path.join(toolsDir, '_imap.py'))).toBe(true);
  });

  it('should have fetch_emails.py in src/tools/email/', () => {
    const realFs = require('node:fs');
    expect(realFs.existsSync(path.join(toolsDir, 'fetch_emails.py'))).toBe(true);
  });

  it('should have search_emails.py in src/tools/email/', () => {
    const realFs = require('node:fs');
    expect(realFs.existsSync(path.join(toolsDir, 'search_emails.py'))).toBe(true);
  });

  it('should have send_email.py in src/tools/email/', () => {
    const realFs = require('node:fs');
    expect(realFs.existsSync(path.join(toolsDir, 'send_email.py'))).toBe(true);
  });

  it('should resolve email tool directory via tools-resolver', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return typeof p === 'string' && p.endsWith(path.sep + 'email');
    });

    const result = resolveToolDir('email');
    expect(result).not.toBeNull();
    expect(result).toMatch(/tools[/\\]email$/);
  });
});

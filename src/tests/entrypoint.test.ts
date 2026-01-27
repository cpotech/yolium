/**
 * Tests for Docker entrypoint.sh behavior
 *
 * These tests verify that the entrypoint.sh script correctly:
 * 1. Authenticates gh CLI when git-credentials are available
 * 2. Creates CLAUDE.md with environment information
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('entrypoint.sh', () => {
  const entrypointPath = path.join(__dirname, '../docker/entrypoint.sh');
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yolium-entrypoint-test-'));
  });

  afterAll(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('script content validation', () => {
    let entrypointContent: string;

    beforeEach(() => {
      entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');
    });

    it('should contain gh CLI authentication logic when git-credentials exists', () => {
      // The entrypoint should check for git-credentials and authenticate gh
      expect(entrypointContent).toContain('gh auth login');
      expect(entrypointContent).toContain('.git-credentials');
    });

    it('should extract GitHub PAT from git-credentials file', () => {
      // Should handle both github_pat_* and ghp_* token formats
      expect(entrypointContent).toContain('github_pat_');
      expect(entrypointContent).toContain('ghp_');
    });

    it('should create CLAUDE.md file', () => {
      // The entrypoint should create a CLAUDE.md file
      expect(entrypointContent).toContain('CLAUDE.md');
      expect(entrypointContent).toContain('/home/agent/CLAUDE.md');
    });

    it('should include Yolium environment info in CLAUDE.md', () => {
      // CLAUDE.md should describe the Yolium environment
      expect(entrypointContent).toContain('Yolium');
      expect(entrypointContent).toContain('container');
    });

    it('should include git access instructions in CLAUDE.md', () => {
      // CLAUDE.md should tell Claude how to check git access
      expect(entrypointContent).toContain('gh auth status');
    });

    it('should unset the token variable after use for security', () => {
      // Token should be unset after authentication to avoid leaking
      expect(entrypointContent).toContain('unset');
    });

    it('should warn against using E2E tests in container', () => {
      // CLAUDE.md should tell Claude not to run E2E tests in container
      expect(entrypointContent).toContain('E2E');
      expect(entrypointContent).toContain('test:e2e');
    });
  });

  // These tests use grep/sed which only exist on Unix - skip on Windows
  describe.skipIf(process.platform === 'win32')('gh token extraction logic', () => {
    it('should correctly extract github_pat_ tokens', () => {
      const gitCredentials = 'https://git:github_pat_11ABC123xyz@github.com\n';
      const credentialsPath = path.join(tempDir, 'git-credentials-pat');
      fs.writeFileSync(credentialsPath, gitCredentials);

      // Test the sed extraction pattern used in entrypoint
      const result = execSync(
        `grep 'github.com' "${credentialsPath}" | sed 's/.*:\\(github_pat_[^@]*\\|ghp_[^@]*\\)@.*/\\1/'`,
        { encoding: 'utf-8' }
      ).trim();

      expect(result).toBe('github_pat_11ABC123xyz');
    });

    it('should correctly extract ghp_ tokens', () => {
      const gitCredentials = 'https://git:ghp_ABC123xyz789@github.com\n';
      const credentialsPath = path.join(tempDir, 'git-credentials-ghp');
      fs.writeFileSync(credentialsPath, gitCredentials);

      const result = execSync(
        `grep 'github.com' "${credentialsPath}" | sed 's/.*:\\(github_pat_[^@]*\\|ghp_[^@]*\\)@.*/\\1/'`,
        { encoding: 'utf-8' }
      ).trim();

      expect(result).toBe('ghp_ABC123xyz789');
    });

    it('should handle credentials file with no github.com entry', () => {
      const gitCredentials = 'https://git:token@gitlab.com\n';
      const credentialsPath = path.join(tempDir, 'git-credentials-gitlab');
      fs.writeFileSync(credentialsPath, gitCredentials);

      const result = execSync(
        `grep 'github.com' "${credentialsPath}" 2>/dev/null | sed 's/.*:\\(github_pat_[^@]*\\|ghp_[^@]*\\)@.*/\\1/' || echo ''`,
        { encoding: 'utf-8' }
      ).trim();

      expect(result).toBe('');
    });
  });
});


// Integration tests that require Docker (skipped if Docker unavailable)
const dockerAvailable = (() => {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const imageExists = (() => {
  if (!dockerAvailable) return false;
  try {
    execSync('docker image inspect yolium:latest', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!dockerAvailable || !imageExists)('entrypoint.sh integration', () => {
  let tempDir: string;
  let gitCredentialsPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yolium-entrypoint-integration-'));
    gitCredentialsPath = path.join(tempDir, 'git-credentials');
  });

  afterAll(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should create CLAUDE.md in container', () => {
    const result = execSync(
      `docker run --rm -e TOOL=shell yolium:latest bash -c "cat /home/agent/CLAUDE.md 2>/dev/null || echo 'FILE_NOT_FOUND'"`,
      { encoding: 'utf-8', timeout: 30000 }
    );

    expect(result).not.toContain('FILE_NOT_FOUND');
    expect(result).toContain('Yolium');
  });

  it('should attempt gh auth when git-credentials mounted', () => {
    const mockCredentials = 'https://git:github_pat_test123@github.com\n';
    fs.writeFileSync(gitCredentialsPath, mockCredentials, { mode: 0o600 });

    const result = execSync(
      `docker run --rm -v "${gitCredentialsPath}:/home/agent/.git-credentials:ro" -e TOOL=shell yolium:latest bash -c "gh auth status 2>&1 || true"`,
      { encoding: 'utf-8', timeout: 30000 }
    );

    // gh should have attempted authentication (even if token is invalid)
    expect(result.includes('github.com') || result.includes('Logged')).toBe(true);
  });
});

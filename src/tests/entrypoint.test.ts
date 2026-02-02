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

    it('should quote the credential file path in git config', () => {
      // The credential helper config must quote $GIT_CRED_FILE to handle paths with spaces
      // It should NOT have an unquoted `--file $GIT_CRED_FILE`
      expect(entrypointContent).not.toMatch(/store --file \$GIT_CRED_FILE"/);
      // It should use proper quoting around the variable
      expect(entrypointContent).toMatch(/store --file=.*\$GIT_CRED_FILE/);
    });

    it('should have an EXIT trap to clean up git credentials', () => {
      // The credential file should be removed when the container process exits
      expect(entrypointContent).toMatch(/trap\s+.*rm\s.*\.git-credentials.*EXIT/);
    });

    it('should warn against using E2E tests in container', () => {
      // CLAUDE.md should tell Claude not to run E2E tests in container
      expect(entrypointContent).toContain('E2E');
      expect(entrypointContent).toContain('test:e2e');
    });

    it('should handle codex tool selection', () => {
      // The entrypoint should have a branch for TOOL=codex
      expect(entrypointContent).toContain('"codex"');
      expect(entrypointContent).toContain('codex');
    });

    it('should display codex version in banner when TOOL=codex', () => {
      // The banner should show codex info when codex is selected
      expect(entrypointContent).toContain('Codex');
    });

    it('should display codex config path in persistent data section', () => {
      // The banner should show ~/.codex for persistent data
      expect(entrypointContent).toContain('.codex');
    });
  });

  describe('codex agent entrypoint behavior', () => {
    let entrypointContent: string;

    beforeEach(() => {
      entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');
    });

    it('should launch codex with --full-auto flag', () => {
      expect(entrypointContent).toContain('--full-auto');
    });

    it('should have a dedicated codex branch in tool selection', () => {
      // The entrypoint should have elif [ "$TOOL" = "codex" ]
      expect(entrypointContent).toContain('TOOL" = "codex"');
    });

    it('should look up codex binary path', () => {
      expect(entrypointContent).toContain('CODEX_BIN=$(which codex)');
    });

    it('should log codex path for debugging', () => {
      expect(entrypointContent).toContain('codex path:');
    });

    it('should prompt user before starting codex', () => {
      expect(entrypointContent).toContain('Press any key to start Codex');
    });

    it('should check for OPENAI_API_KEY before launching Codex', () => {
      expect(entrypointContent).toContain('OPENAI_API_KEY');
      expect(entrypointContent).toContain('Falling back to shell');
    });

    it('should check for OAuth auth.json when OPENAI_API_KEY is missing', () => {
      // When OPENAI_API_KEY is empty, entrypoint should check for OAuth tokens in auth.json
      expect(entrypointContent).toContain('.codex/auth.json');
      expect(entrypointContent).toContain('access_token');
      expect(entrypointContent).toContain('OAuth');
    });

    it('should show distinct message for missing auth vs missing API key', () => {
      // Should mention both OPENAI_API_KEY and codex login as options
      expect(entrypointContent).toContain('codex login');
      expect(entrypointContent).toContain('OPENAI_API_KEY');
    });

    it('should display codex persistent data path in banner', () => {
      // When TOOL=codex, banner shows ~/.codex
      expect(entrypointContent).toContain('~/.codex');
    });

    it('should show Codex CLI version in banner', () => {
      expect(entrypointContent).toContain('codex --version');
    });
  });

  describe('codex code review auth validation', () => {
    let entrypointContent: string;

    beforeEach(() => {
      entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');
    });

    it('should validate auth before running codex exec in code review', () => {
      // The code review codex path should check OPENAI_API_KEY before running codex exec
      // Find the code-review codex block (REVIEW_AGENT = codex)
      const reviewCodexSection = entrypointContent.split('REVIEW_AGENT" = "codex"')[1]?.split('exit $?')[0];
      expect(reviewCodexSection).toBeDefined();
      expect(reviewCodexSection).toContain('OPENAI_API_KEY');
      expect(reviewCodexSection).toContain('.codex/auth.json');
    });

    it('should exit with code 3 when no codex auth is found in code review', () => {
      const reviewCodexSection = entrypointContent.split('REVIEW_AGENT" = "codex"')[1]?.split('codex exec')[0];
      expect(reviewCodexSection).toContain('exit 3');
    });

    it('should have a grep fallback when jq is unavailable for OAuth detection', () => {
      // The code review path should not solely rely on jq for auth.json parsing
      const reviewCodexSection = entrypointContent.split('REVIEW_AGENT" = "codex"')[1]?.split('codex exec')[0];
      expect(reviewCodexSection).toContain('grep');
      expect(reviewCodexSection).toContain('access_token');
    });
  });

  describe('PR detection error handling', () => {
    let entrypointContent: string;

    beforeEach(() => {
      entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');
    });

    it('should check gh auth status before PR lookup', () => {
      // The code-review section should verify gh auth before running gh pr list
      // Extract the code-review block (from code-review elif to the next elif)
      const reviewStart = entrypointContent.indexOf('TOOL" = "code-review"');
      expect(reviewStart).toBeGreaterThan(-1);
      // Find the next elif after the code-review block
      const reviewEnd = entrypointContent.indexOf('elif', reviewStart + 1);
      expect(reviewEnd).toBeGreaterThan(reviewStart);
      const reviewBlock = entrypointContent.slice(reviewStart, reviewEnd);
      const authInReview = reviewBlock.indexOf('gh auth status');
      const prInReview = reviewBlock.indexOf('gh pr list');
      expect(authInReview).toBeGreaterThan(-1);
      expect(prInReview).toBeGreaterThan(authInReview);
    });

    it('should report auth-specific error when gh is not authenticated', () => {
      expect(entrypointContent).toContain('GitHub CLI is not authenticated');
    });

    it('should capture gh pr list exit code separately', () => {
      // Should check exit code of gh pr list rather than just empty output
      expect(entrypointContent).toContain('PR_EXIT');
    });

    it('should not suppress stderr from gh pr list', () => {
      // The gh pr list call should capture stderr (2>&1) not suppress it (2>/dev/null)
      const reviewStart = entrypointContent.indexOf('TOOL" = "code-review"');
      const reviewEnd = entrypointContent.indexOf('elif', reviewStart + 1);
      const reviewBlock = entrypointContent.slice(reviewStart, reviewEnd);
      // Should use 2>&1 not 2>/dev/null for PR lookup
      expect(reviewBlock).toContain('2>&1');
      expect(reviewBlock).not.toContain('2>/dev/null');
    });
  });

  describe('gh token extraction logic', () => {
    // Helper that mimics the entrypoint.sh extraction logic using JS regex
    // This is equivalent to: grep 'github.com' file | sed 's/.*:\(github_pat_[^@]*\|ghp_[^@]*\)@.*/\1/'
    function extractGitHubToken(credentialsContent: string): string {
      const githubLine = credentialsContent.split('\n').find(line => line.includes('github.com'));
      if (!githubLine) return '';
      const match = githubLine.match(/:(github_pat_[^@]*|ghp_[^@]*)@/);
      return match ? match[1] : '';
    }

    it('should correctly extract github_pat_ tokens', () => {
      const gitCredentials = 'https://git:github_pat_11ABC123xyz@github.com\n';
      const result = extractGitHubToken(gitCredentials);
      expect(result).toBe('github_pat_11ABC123xyz');
    });

    it('should correctly extract ghp_ tokens', () => {
      const gitCredentials = 'https://git:ghp_ABC123xyz789@github.com\n';
      const result = extractGitHubToken(gitCredentials);
      expect(result).toBe('ghp_ABC123xyz789');
    });

    it('should handle credentials file with no github.com entry', () => {
      const gitCredentials = 'https://git:token@gitlab.com\n';
      const result = extractGitHubToken(gitCredentials);
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
      `docker run --rm -v "${gitCredentialsPath}:/home/agent/.git-credentials-mounted:ro" -e TOOL=shell yolium:latest bash -c "gh auth status 2>&1 || true"`,
      { encoding: 'utf-8', timeout: 30000 }
    );

    // gh should have attempted authentication (even if token is invalid)
    expect(result.includes('github.com') || result.includes('Logged')).toBe(true);
  });
});

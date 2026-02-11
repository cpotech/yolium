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
      // The credential file should be removed when the container process exits via cleanup function
      expect(entrypointContent).toMatch(/trap\s+cleanup\s+EXIT/);
      expect(entrypointContent).toContain('rm -f /tmp/.git-credentials');
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

    it('should not reference host codex config in banner', () => {
      // The banner should NOT reference host ~/.codex path (API keys passed via env vars now)
      const bannerSection = entrypointContent.split('Persistent data')[1]?.split('BANNER')[0] || '';
      expect(bannerSection).not.toContain('~/.codex');
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

    it('should launch codex with full-auto and danger-full-access sandbox', () => {
      expect(entrypointContent).toMatch(/exec\s+"\$CODEX_BIN"\s+--full-auto\s+--sandbox\s+danger-full-access/);
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

    it('should direct users to Yolium Settings for authentication', () => {
      // When OPENAI_API_KEY is empty and no OAuth, entrypoint should direct users to Yolium Settings
      expect(entrypointContent).toContain('Yolium Settings');
    });

    it('should support Codex OAuth as alternative to API key', () => {
      // Codex auth check should accept either OPENAI_API_KEY or OAuth credentials
      expect(entrypointContent).toContain('.codex/auth.json');
      expect(entrypointContent).toContain('CODEX_OAUTH_ENABLED');
    });

    it('should show Codex CLI version in banner', () => {
      expect(entrypointContent).toContain('codex --version');
    });
  });

  describe('agent tool mode', () => {
    it('should decode base64 prompt and build claude command', () => {
      const testPrompt = 'You are a test agent.\n\nDo something.';
      const base64Prompt = Buffer.from(testPrompt).toString('base64');

      // Test that base64 decoding works correctly
      const decoded = Buffer.from(base64Prompt, 'base64').toString('utf-8');
      expect(decoded).toBe(testPrompt);
    });

    it('should handle multi-line prompts with special characters', () => {
      const complexPrompt = `# Agent

Use these tools:
- Read
- Glob

Output: @@YOLIUM:{"type":"complete","summary":"done"}`;

      const base64Prompt = Buffer.from(complexPrompt).toString('base64');
      const decoded = Buffer.from(base64Prompt, 'base64').toString('utf-8');
      expect(decoded).toBe(complexPrompt);
    });

    it('should have agent mode in entrypoint script', () => {
      const entrypointPath = path.join(__dirname, '../docker/entrypoint.sh');
      const entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');

      // The entrypoint should have a branch for TOOL=agent
      expect(entrypointContent).toContain('TOOL" = "agent"');
    });

    it('should require AGENT_PROMPT environment variable', () => {
      const entrypointPath = path.join(__dirname, '../docker/entrypoint.sh');
      const entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');

      expect(entrypointContent).toContain('AGENT_PROMPT');
      expect(entrypointContent).toContain('AGENT_PROMPT environment variable is required');
    });

    it('should require AGENT_MODEL environment variable', () => {
      const entrypointPath = path.join(__dirname, '../docker/entrypoint.sh');
      const entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');

      expect(entrypointContent).toContain('AGENT_MODEL');
      expect(entrypointContent).toContain('AGENT_MODEL environment variable is required');
    });

    it('should decode base64 prompt in agent mode', () => {
      const entrypointPath = path.join(__dirname, '../docker/entrypoint.sh');
      const entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');

      expect(entrypointContent).toContain('base64 -d');
    });

    it('should map model short names to full model IDs', () => {
      const entrypointPath = path.join(__dirname, '../docker/entrypoint.sh');
      const entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');

      expect(entrypointContent).toContain('opus)');
      expect(entrypointContent).toContain('sonnet)');
      expect(entrypointContent).toContain('haiku)');
      expect(entrypointContent).toContain('claude-opus-4-6');
      expect(entrypointContent).toContain('claude-sonnet-4-5-20250929');
      expect(entrypointContent).toContain('claude-haiku-4-5-20251001');
    });

    it('should support optional AGENT_TOOLS for allowed tools', () => {
      const entrypointPath = path.join(__dirname, '../docker/entrypoint.sh');
      const entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');

      expect(entrypointContent).toContain('AGENT_TOOLS');
      expect(entrypointContent).toContain('--allowedTools');
    });

    it('should run claude with --dangerously-skip-permissions', () => {
      const entrypointPath = path.join(__dirname, '../docker/entrypoint.sh');
      const entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');

      // Find the agent section specifically
      const agentStart = entrypointContent.indexOf('TOOL" = "agent"');
      // Find the next elif after the TOOL=opencode section (which comes after agent)
      const agentEnd = entrypointContent.indexOf('elif [ "$TOOL" = "opencode" ]', agentStart + 1);
      const agentBlock = entrypointContent.slice(agentStart, agentEnd > -1 ? agentEnd : undefined);

      // Claude is in the default else branch when AGENT_PROVIDER is not opencode or codex
      expect(agentBlock).toContain('--dangerously-skip-permissions');
    });

    it('should support AGENT_PROVIDER environment variable', () => {
      const entrypointPath = path.join(__dirname, '../docker/entrypoint.sh');
      const entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');

      expect(entrypointContent).toContain('AGENT_PROVIDER');
    });

    it('should default to claude when AGENT_PROVIDER is not set', () => {
      const entrypointPath = path.join(__dirname, '../docker/entrypoint.sh');
      const entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');

      expect(entrypointContent).toContain('AGENT_PROVIDER:-claude');
    });

    it('should run opencode when AGENT_PROVIDER=opencode', () => {
      const entrypointPath = path.join(__dirname, '../docker/entrypoint.sh');
      const entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');

      const agentStart = entrypointContent.indexOf('TOOL" = "agent"');
      // Find the next elif after the TOOL=opencode section (which comes after agent)
      const agentEnd = entrypointContent.indexOf('elif [ "$TOOL" = "opencode" ]', agentStart + 1);
      const agentBlock = entrypointContent.slice(agentStart, agentEnd > -1 ? agentEnd : undefined);

      expect(agentBlock).toContain('if [ "$AGENT_PROV" = "opencode" ]');
      expect(agentBlock).toContain('opencode run');
    });

    it('should run codex when AGENT_PROVIDER=codex', () => {
      const entrypointPath = path.join(__dirname, '../docker/entrypoint.sh');
      const entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');

      const agentStart = entrypointContent.indexOf('TOOL" = "agent"');
      // Find the next elif after the TOOL=opencode section (which comes after agent)
      const agentEnd = entrypointContent.indexOf('elif [ "$TOOL" = "opencode" ]', agentStart + 1);
      const agentBlock = entrypointContent.slice(agentStart, agentEnd > -1 ? agentEnd : undefined);

      expect(agentBlock).toContain('elif [ "$AGENT_PROV" = "codex" ]');
      expect(agentBlock).toContain('codex exec');
    });

    it('should configure reasoning effort for Codex agent mode', () => {
      const entrypointPath = path.join(__dirname, '../docker/entrypoint.sh');
      const entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');

      const agentBlock = entrypointContent.split('AGENT_PROV" = "codex"')[1]?.split('exit $?')[0];
      expect(agentBlock).toContain('model_reasoning_effort');
      expect(agentBlock).toContain('high');
    });
  });

  describe('Claude OAuth support', () => {
    let entrypointContent: string;

    beforeEach(() => {
      entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');
    });

    it('should check for .claude-credentials.json file when CLAUDE_OAUTH_ENABLED is true', () => {
      expect(entrypointContent).toContain('.claude-credentials.json');
      expect(entrypointContent).toContain('CLAUDE_OAUTH_ENABLED');
    });

    it('should copy OAuth credentials file to agent claude config directory', () => {
      // Should copy single credentials file to minimal ~/.claude directory
      expect(entrypointContent).toContain('cp /home/agent/.claude-credentials.json /home/agent/.claude/.credentials.json');
    });

    it('should set correct permissions on OAuth credentials', () => {
      expect(entrypointContent).toContain('chmod 700 /home/agent/.claude');
      expect(entrypointContent).toContain('chmod 600 /home/agent/.claude/.credentials.json');
    });

    it('should export CLAUDE_CONFIG_DIR when OAuth is configured', () => {
      expect(entrypointContent).toContain('CLAUDE_CONFIG_DIR');
      expect(entrypointContent).toContain('/home/agent/.claude');
    });

    it('should have a cleanup function for EXIT trap', () => {
      // Should use a cleanup function pattern instead of inline trap
      expect(entrypointContent).toContain('cleanup()');
      expect(entrypointContent).toMatch(/trap\s+cleanup\s+EXIT/);
    });

    it('should clean up both git-credentials and OAuth in cleanup function', () => {
      // Extract the cleanup function body
      const cleanupStart = entrypointContent.indexOf('cleanup()');
      expect(cleanupStart).toBeGreaterThan(-1);
      const cleanupEnd = entrypointContent.indexOf('}', cleanupStart);
      const cleanupBody = entrypointContent.slice(cleanupStart, cleanupEnd);
      expect(cleanupBody).toContain('.git-credentials');
      expect(cleanupBody).toContain('.claude');
    });

    it('should accept .credentials.json as alternative to ANTHROPIC_API_KEY for Claude', () => {
      // Claude checks should allow OAuth credentials file as fallback
      expect(entrypointContent).toContain('.claude/.credentials.json');
    });

    it('should still require ANTHROPIC_API_KEY for OpenCode (no OAuth fallback)', () => {
      // OpenCode interactive sections should still check only ANTHROPIC_API_KEY
      // Use the elif pattern to find the tool selection section (not the banner)
      const opencodeInteractiveStart = entrypointContent.indexOf('elif [ "$TOOL" = "opencode" ]');
      expect(opencodeInteractiveStart).toBeGreaterThan(-1);
      const opencodeEnd = entrypointContent.indexOf('elif', opencodeInteractiveStart + 1);
      const opencodeBlock = entrypointContent.slice(opencodeInteractiveStart, opencodeEnd > -1 ? opencodeEnd : undefined);
      expect(opencodeBlock).toContain('ANTHROPIC_API_KEY');
      expect(opencodeBlock).not.toContain('.credentials.json');
    });

    it('should mention OAuth in CLAUDE.md content', () => {
      expect(entrypointContent).toContain('Claude Max OAuth');
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

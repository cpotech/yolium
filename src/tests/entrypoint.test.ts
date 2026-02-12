/**
 * Tests for Docker entrypoint.sh behavior
 *
 * These tests verify that the entrypoint scripts correctly:
 * 1. Authenticate gh CLI when git-credentials are available
 * 2. Create CLAUDE.md with environment information
 *
 * The entrypoint is split into modular scripts under entrypoint.d/.
 * Tests read all scripts to validate content across modules.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const dockerDir = path.join(__dirname, '../docker');

/** Read all entrypoint scripts (orchestrator + modules + tools) as combined content */
function readAllEntrypointScripts(): string {
  const entrypoint = fs.readFileSync(path.join(dockerDir, 'entrypoint.sh'), 'utf-8');
  const entrypointD = path.join(dockerDir, 'entrypoint.d');

  const scripts = fs.readdirSync(entrypointD, { recursive: true })
    .map(f => f.toString())
    .filter(f => f.endsWith('.sh'))
    .sort()
    .map(f => fs.readFileSync(path.join(entrypointD, f), 'utf-8'));

  return [entrypoint, ...scripts].join('\n');
}

/** Read a specific tool script from entrypoint.d/80-tools/ */
function readToolScript(tool: string): string {
  return fs.readFileSync(path.join(dockerDir, 'entrypoint.d', '80-tools', `${tool}.sh`), 'utf-8');
}

describe('entrypoint.sh', () => {
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
      entrypointContent = readAllEntrypointScripts();
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

    it('should install Node.js dependencies based on lock files and package manager metadata', () => {
      expect(entrypointContent).toContain('NODE_PACKAGE_MANAGER');
      expect(entrypointContent).toContain('npm ci');
      expect(entrypointContent).toContain('yarn install --frozen-lockfile');
      expect(entrypointContent).toContain('pnpm install --frozen-lockfile');
    });

    it('should install Go and Rust dependencies when project files are present', () => {
      expect(entrypointContent).toContain('go mod download');
      expect(entrypointContent).toContain('cargo fetch');
    });

    it('should install Python dependencies after creating venv', () => {
      expect(entrypointContent).toContain('uv venv .venv');
      expect(entrypointContent).toContain('uv pip install --python .venv/bin/python -r requirements.txt');
    });

    it('should append project context files into generated CLAUDE.md', () => {
      expect(entrypointContent).toContain('append_context_file');
      expect(entrypointContent).toContain('$PROJECT_DIR/README.md');
      expect(entrypointContent).toContain('$PROJECT_DIR/CLAUDE.md');
      expect(entrypointContent).toContain('$PROJECT_DIR/AGENTS.md');
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
      // The entrypoint should have a codex tool script
      const codexScript = readToolScript('codex');
      expect(codexScript).toContain('codex');
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
      entrypointContent = readAllEntrypointScripts();
    });

    it('should launch codex with --full-auto flag', () => {
      expect(entrypointContent).toContain('--full-auto');
    });

    it('should launch codex with full-auto and danger-full-access sandbox', () => {
      expect(entrypointContent).toMatch(/exec\s+"\$CODEX_BIN"\s+--full-auto\s+--sandbox\s+danger-full-access/);
    });

    it('should have a dedicated codex tool script', () => {
      // The entrypoint should have a codex tool script in 80-tools/
      const codexScript = readToolScript('codex');
      expect(codexScript).toContain('Codex');
      expect(codexScript).toContain('CODEX_BIN');
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

    it('should have agent mode tool script', () => {
      // The entrypoint should have an agent tool script in 80-tools/
      const agentScript = readToolScript('agent');
      expect(agentScript).toContain('AGENT_PROMPT');
      expect(agentScript).toContain('AGENT_MODEL');
    });

    it('should require AGENT_PROMPT environment variable', () => {
      const agentScript = readToolScript('agent');

      expect(agentScript).toContain('AGENT_PROMPT');
      expect(agentScript).toContain('AGENT_PROMPT environment variable is required');
    });

    it('should require AGENT_MODEL environment variable', () => {
      const agentScript = readToolScript('agent');

      expect(agentScript).toContain('AGENT_MODEL');
      expect(agentScript).toContain('AGENT_MODEL environment variable is required');
    });

    it('should decode base64 prompt in agent mode', () => {
      const agentScript = readToolScript('agent');

      expect(agentScript).toContain('base64 -d');
    });

    it('should map model short names to full model IDs', () => {
      const agentScript = readToolScript('agent');

      expect(agentScript).toContain('opus)');
      expect(agentScript).toContain('sonnet)');
      expect(agentScript).toContain('haiku)');
      expect(agentScript).toContain('claude-opus-4-6');
      expect(agentScript).toContain('claude-sonnet-4-5-20250929');
      expect(agentScript).toContain('claude-haiku-4-5-20251001');
    });

    it('should support optional AGENT_TOOLS for allowed tools', () => {
      const agentScript = readToolScript('agent');

      expect(agentScript).toContain('AGENT_TOOLS');
      expect(agentScript).toContain('--allowedTools');
    });

    it('should run claude with --dangerously-skip-permissions', () => {
      const agentScript = readToolScript('agent');

      // Claude is in the default else branch when AGENT_PROVIDER is not opencode or codex
      expect(agentScript).toContain('--dangerously-skip-permissions');
    });

    it('should support AGENT_PROVIDER environment variable', () => {
      const agentScript = readToolScript('agent');

      expect(agentScript).toContain('AGENT_PROVIDER');
    });

    it('should default to claude when AGENT_PROVIDER is not set', () => {
      const agentScript = readToolScript('agent');

      expect(agentScript).toContain('AGENT_PROVIDER:-claude');
    });

    it('should run opencode when AGENT_PROVIDER=opencode', () => {
      const agentScript = readToolScript('agent');

      expect(agentScript).toContain('if [ "$AGENT_PROV" = "opencode" ]');
      expect(agentScript).toContain('opencode run');
    });

    it('should run codex when AGENT_PROVIDER=codex', () => {
      const agentScript = readToolScript('agent');

      expect(agentScript).toContain('elif [ "$AGENT_PROV" = "codex" ]');
      expect(agentScript).toContain('codex exec');
    });

    it('should configure reasoning effort for Codex agent mode', () => {
      const agentScript = readToolScript('agent');

      const agentBlock = agentScript.split('AGENT_PROV" = "codex"')[1]?.split('exit $?')[0];
      expect(agentBlock).toContain('model_reasoning_effort');
      expect(agentBlock).toContain('high');
    });
  });

  describe('Claude OAuth support', () => {
    let entrypointContent: string;

    beforeEach(() => {
      entrypointContent = readAllEntrypointScripts();
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
      // OpenCode interactive tool script should check only ANTHROPIC_API_KEY
      const opencodeScript = readToolScript('opencode');
      expect(opencodeScript).toContain('ANTHROPIC_API_KEY');
      expect(opencodeScript).not.toContain('.credentials.json');
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

  describe('modular structure', () => {
    it('should have all required setup modules', () => {
      const entrypointD = path.join(dockerDir, 'entrypoint.d');
      const expectedModules = [
        '00-utils.sh',
        '10-network.sh',
        '20-paths.sh',
        '30-languages.sh',
        '40-git.sh',
        '50-credentials.sh',
        '60-claudemd.sh',
        '70-banner.sh',
      ];
      for (const mod of expectedModules) {
        expect(fs.existsSync(path.join(entrypointD, mod))).toBe(true);
      }
    });

    it('should have all required tool scripts', () => {
      const toolsDir = path.join(dockerDir, 'entrypoint.d', '80-tools');
      const expectedTools = ['shell.sh', 'agent.sh', 'claude.sh', 'opencode.sh', 'codex.sh'];
      for (const tool of expectedTools) {
        expect(fs.existsSync(path.join(toolsDir, tool))).toBe(true);
      }
    });

    it('should have orchestrator that sources modules and dispatches tools', () => {
      const orchestrator = fs.readFileSync(path.join(dockerDir, 'entrypoint.sh'), 'utf-8');
      expect(orchestrator).toContain('entrypoint.d');
      expect(orchestrator).toContain('80-tools');
      expect(orchestrator).toContain('source "$script"');
      expect(orchestrator).toContain('source "$TOOL_SCRIPT"');
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

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import type { GitConfig } from '@shared/types/git';

export type { GitConfig } from '@shared/types/git';

/**
 * Interface to track the source of detected Git configuration
 */
export interface DetectedGitConfig extends GitConfig {
  sources: {
    name?: 'system' | 'environment' | 'yolium';
    email?: 'system' | 'environment' | 'yolium';
    githubPat?: 'system' | 'environment' | 'yolium';
    openaiApiKey?: 'system' | 'environment' | 'yolium';
    anthropicApiKey?: 'system' | 'environment' | 'yolium';
  };
}

/**
 * Load Git configuration from system Git (git config --global)
 */
function loadSystemGitConfig(): Partial<GitConfig> | null {
  try {
    const name = execSync('git config --global user.name', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    const email = execSync('git config --global user.email', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();

    const config: Partial<GitConfig> = {};
    if (name) config.name = name;
    if (email) config.email = email;

    return Object.keys(config).length > 0 ? config : null;
  } catch {
    // Git not available or no global config set
    return null;
  }
}

/**
 * Load Git configuration from environment variables
 */
function loadEnvironmentGitConfig(): Partial<GitConfig> | null {
  const config: Partial<GitConfig> = {};
  
  // Check common Git environment variables
  const name = process.env.GIT_AUTHOR_NAME || process.env.GIT_COMMITTER_NAME;
  const email = process.env.GIT_AUTHOR_EMAIL || process.env.GIT_COMMITTER_EMAIL;
  
  // Check for other potential environment variables
  const githubPat = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (name) config.name = name;
  if (email) config.email = email;
  if (githubPat) config.githubPat = githubPat;
  if (openaiKey) config.openaiApiKey = openaiKey;
  if (anthropicKey) config.anthropicApiKey = anthropicKey;
  
  return Object.keys(config).length > 0 ? config : null;
}

/**
 * Load Git configuration from all sources with source tracking
 */
export function loadDetectedGitConfig(): DetectedGitConfig | null {
  const systemConfig = loadSystemGitConfig();
  const envConfig = loadEnvironmentGitConfig();
  const yoliumConfig = loadGitConfig();
  
  const detected: DetectedGitConfig = {
    name: '',
    email: '',
    sources: {}
  };
  
  let hasAnyConfig = false;
  
  // Priority: Yolium > Environment > System for each field
  if (yoliumConfig?.name) {
    detected.name = yoliumConfig.name;
    detected.sources.name = 'yolium';
    hasAnyConfig = true;
  } else if (envConfig?.name) {
    detected.name = envConfig.name;
    detected.sources.name = 'environment';
    hasAnyConfig = true;
  } else if (systemConfig?.name) {
    detected.name = systemConfig.name;
    detected.sources.name = 'system';
    hasAnyConfig = true;
  }
  
  if (yoliumConfig?.email) {
    detected.email = yoliumConfig.email;
    detected.sources.email = 'yolium';
    hasAnyConfig = true;
  } else if (envConfig?.email) {
    detected.email = envConfig.email;
    detected.sources.email = 'environment';
    hasAnyConfig = true;
  } else if (systemConfig?.email) {
    detected.email = systemConfig.email;
    detected.sources.email = 'system';
    hasAnyConfig = true;
  }
  
  // For tokens, we only check environment and yolium (no system git config for these)
  if (yoliumConfig?.githubPat) {
    detected.githubPat = yoliumConfig.githubPat;
    detected.sources.githubPat = 'yolium';
    hasAnyConfig = true;
  } else if (envConfig?.githubPat) {
    detected.githubPat = envConfig.githubPat;
    detected.sources.githubPat = 'environment';
    hasAnyConfig = true;
  }
  
  if (yoliumConfig?.openaiApiKey) {
    detected.openaiApiKey = yoliumConfig.openaiApiKey;
    detected.sources.openaiApiKey = 'yolium';
    hasAnyConfig = true;
  } else if (envConfig?.openaiApiKey) {
    detected.openaiApiKey = envConfig.openaiApiKey;
    detected.sources.openaiApiKey = 'environment';
    hasAnyConfig = true;
  }

  if (yoliumConfig?.anthropicApiKey) {
    detected.anthropicApiKey = yoliumConfig.anthropicApiKey;
    detected.sources.anthropicApiKey = 'yolium';
    hasAnyConfig = true;
  } else if (envConfig?.anthropicApiKey) {
    detected.anthropicApiKey = envConfig.anthropicApiKey;
    detected.sources.anthropicApiKey = 'environment';
    hasAnyConfig = true;
  }

  return hasAnyConfig ? detected : null;
}

/**
 * Get the path to the settings file.
 * Stored at ~/.yolium/settings.json
 *
 * Migrates from the legacy gitconfig.json path if needed.
 */
export function getGitConfigPath(): string {
  const settingsPath = path.join(os.homedir(), '.yolium', 'settings.json');
  const legacyPath = path.join(os.homedir(), '.yolium', 'gitconfig.json');

  // Migrate: rename legacy file if new one doesn't exist yet
  if (!fs.existsSync(settingsPath) && fs.existsSync(legacyPath)) {
    fs.renameSync(legacyPath, settingsPath);
  }

  return settingsPath;
}

/**
 * Check if the host has valid Claude OAuth credentials.
 * Looks for ~/.claude/.credentials.json with a valid accessToken.
 *
 * @returns true if valid OAuth credentials exist on the host
 */
export function hasHostClaudeOAuth(): boolean {
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    if (!fs.existsSync(credPath)) return false;
    const content = fs.readFileSync(credPath, 'utf-8');
    const creds = JSON.parse(content);
    return !!(creds?.claudeAiOauth?.accessToken);
  } catch {
    return false;
  }
}

/**
 * Check if the host has valid Codex OAuth credentials.
 * Looks for ~/.codex/auth.json with auth_mode === "chatgpt" and a valid access_token.
 *
 * @returns true if valid Codex OAuth credentials exist on the host
 */
export function hasHostCodexOAuth(): boolean {
  try {
    const authPath = path.join(os.homedir(), '.codex', 'auth.json');
    if (!fs.existsSync(authPath)) return false;
    const content = fs.readFileSync(authPath, 'utf-8');
    const auth = JSON.parse(content);
    return auth?.auth_mode === 'chatgpt' && !!(auth?.tokens?.access_token);
  } catch {
    return false;
  }
}

/** Codex OAuth token endpoint (same as official Codex CLI). */
const CODEX_TOKEN_ENDPOINT = 'https://auth.openai.com/oauth/token';
/** Codex OAuth client ID (same as official Codex CLI). */
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

/**
 * Refresh the Codex OAuth token on the host.
 * Reads ~/.codex/auth.json, exchanges the refresh_token for a new access_token,
 * and writes the updated tokens back to the file.
 *
 * This must be called before mounting auth.json into containers because
 * OpenAI enforces refresh token rotation (single-use). If the host or another
 * container already used the refresh_token, the old one is invalid.
 *
 * @returns true if the token was successfully refreshed, false otherwise
 */
export async function refreshCodexOAuthToken(): Promise<boolean> {
  try {
    const authPath = path.join(os.homedir(), '.codex', 'auth.json');
    if (!fs.existsSync(authPath)) return false;

    const content = fs.readFileSync(authPath, 'utf-8');
    const auth = JSON.parse(content);

    // Only refresh for ChatGPT OAuth mode with a valid refresh token
    if (auth?.auth_mode !== 'chatgpt' || !auth?.tokens?.refresh_token) {
      return false;
    }

    const response = await fetch(CODEX_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CODEX_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: auth.tokens.refresh_token,
        scope: 'openid profile email',
      }),
    });

    if (!response.ok) {
      console.warn(`[git-config] Codex OAuth refresh failed: ${response.status} ${response.statusText}`);
      return false;
    }

    const data = await response.json();

    // Update tokens in the auth object
    auth.tokens.access_token = data.access_token;
    auth.tokens.refresh_token = data.refresh_token;
    if (data.id_token) {
      auth.tokens.id_token = data.id_token;
    }
    auth.last_refresh = new Date().toISOString();

    // Write back with restrictive permissions
    fs.writeFileSync(authPath, JSON.stringify(auth, null, 2), { encoding: 'utf-8', mode: 0o600 });
    return true;
  } catch (err) {
    console.warn('[git-config] Codex OAuth refresh error:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

/**
 * Module-level mutex for Codex token refresh.
 * Ensures parallel container launches share a single refresh call
 * rather than racing to refresh the same single-use token.
 */
let codexRefreshLock: Promise<boolean> | null = null;

/**
 * Refresh the Codex OAuth token with serialization.
 * If a refresh is already in progress, returns the same promise
 * so concurrent callers wait for one refresh instead of racing.
 *
 * @returns true if the token was successfully refreshed, false otherwise
 */
export async function refreshCodexOAuthTokenSerialized(): Promise<boolean> {
  if (codexRefreshLock) return codexRefreshLock;
  codexRefreshLock = refreshCodexOAuthToken().finally(() => {
    codexRefreshLock = null;
  });
  return codexRefreshLock;
}

/**
 * Get the host ~/.codex/auth.json path if it exists.
 * Used for mounting Codex OAuth credentials into containers.
 *
 * @returns Path to the auth file or null if it doesn't exist
 */
export function getHostCodexCredentialsPath(): string | null {
  const authPath = path.join(os.homedir(), '.codex', 'auth.json');
  try {
    if (fs.statSync(authPath).isFile()) {
      return authPath;
    }
  } catch {
    // File doesn't exist
  }
  return null;
}

/**
 * Get the host ~/.claude/.credentials.json path if it exists.
 * Used for mounting OAuth credentials into containers.
 *
 * @returns Path to the credentials file or null if it doesn't exist
 */
export function getHostClaudeCredentialsPath(): string | null {
  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
  try {
    if (fs.statSync(credPath).isFile()) {
      return credPath;
    }
  } catch {
    // File doesn't exist
  }
  return null;
}

/**
 * Load git config from file.
 * Returns null if the file doesn't exist or is invalid.
 */
export function loadGitConfig(): GitConfig | null {
  const configPath = getGitConfigPath();

  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);

    // Config is valid if it has any meaningful field
    if (typeof config === 'object' && config !== null) {
      const result: GitConfig = {
        name: typeof config.name === 'string' ? config.name : '',
        email: typeof config.email === 'string' ? config.email : '',
        ...(typeof config.githubPat === 'string' && config.githubPat ? { githubPat: config.githubPat } : {}),
        ...(typeof config.openaiApiKey === 'string' && config.openaiApiKey ? { openaiApiKey: config.openaiApiKey } : {}),
        ...(typeof config.anthropicApiKey === 'string' && config.anthropicApiKey ? { anthropicApiKey: config.anthropicApiKey } : {}),
        ...(typeof config.githubLogin === 'string' && config.githubLogin ? { githubLogin: config.githubLogin } : {}),
        ...(config.useClaudeOAuth === true ? { useClaudeOAuth: true } : {}),
        ...(config.useCodexOAuth === true ? { useCodexOAuth: true } : {}),
        ...(config.providerModelDefaults && typeof config.providerModelDefaults === 'object'
          ? { providerModelDefaults: config.providerModelDefaults }
          : {}),
      ...(config.providerModels && typeof config.providerModels === 'object'
          ? { providerModels: config.providerModels }
          : {}),
      };

      // Migrate: if providerModels is absent but providerModelDefaults exists,
      // convert each single string value to a single-element array
      if (!result.providerModels && result.providerModelDefaults) {
        const migrated: Record<string, string[]> = {};
        for (const [provider, model] of Object.entries(result.providerModelDefaults)) {
          if (typeof model === 'string' && model) {
            migrated[provider] = [model];
          }
        }
        if (Object.keys(migrated).length > 0) {
          result.providerModels = migrated;
        }
      }

      // Return config if it has at least one meaningful value
      const hasMeaningful = result.name || result.email || result.githubPat || result.openaiApiKey || result.anthropicApiKey || result.useClaudeOAuth || result.useCodexOAuth || result.providerModelDefaults || result.providerModels;
      return hasMeaningful ? result : null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch GitHub user identity from a PAT via the GitHub API.
 * Returns { name, email, login } or null on any error.
 */
export async function fetchGitHubUser(pat: string): Promise<{ name: string; email: string; login: string } | null> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const login: string = data.login || '';
    const name: string = data.name || login;
    const email: string = data.email || (login ? `${login}@users.noreply.github.com` : '');

    return { name, email, login };
  } catch {
    return null;
  }
}

/**
 * Save git config to file.
 * Creates the .yolium directory if it doesn't exist.
 */
export function saveGitConfig(config: GitConfig): void {
  const configPath = getGitConfigPath();
  const configDir = path.dirname(configPath);

  // Ensure .yolium directory exists
  fs.mkdirSync(configDir, { recursive: true });

  // Write config file with restrictive permissions (secrets may be included)
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

/**
 * Get the path to the git-credentials file.
 * This file is generated from the PAT in settings.json.
 */
export function getGitCredentialsPath(): string {
  return path.join(os.homedir(), '.yolium', 'git-credentials');
}

/**
 * Generate git-credentials file from PAT.
 * Returns the path to the credentials file if PAT exists, null otherwise.
 * The credentials file is in git's store format: https://user:token@github.com
 */
export function generateGitCredentials(gitConfig: GitConfig | null): string | null {
  if (!gitConfig?.githubPat) {
    return null;
  }

  const credPath = getGitCredentialsPath();
  const credDir = path.dirname(credPath);

  // Ensure directory exists
  fs.mkdirSync(credDir, { recursive: true });

  // Write credentials in git's store format
  // Using 'git' as the username works with GitHub PATs
  // Strip trailing @github.com if user pasted the full credential URL token
  const pat = gitConfig.githubPat.replace(/@github\.com$/, '');
  const credContent = `https://git:${pat}@github.com\n`;
  fs.writeFileSync(credPath, credContent, { mode: 0o600 });

  return credPath;
}

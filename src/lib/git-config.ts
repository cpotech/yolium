import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { GitConfig } from '../types/git';

export type { GitConfig } from '../types/git';

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

    // Validate the config has required fields
    if (typeof config.name === 'string' && typeof config.email === 'string') {
      return {
        name: config.name,
        email: config.email,
        ...(typeof config.githubPat === 'string' && config.githubPat ? { githubPat: config.githubPat } : {}),
        ...(typeof config.openaiApiKey === 'string' && config.openaiApiKey ? { openaiApiKey: config.openaiApiKey } : {}),
      };
    }

    return null;
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
  const credContent = `https://git:${gitConfig.githubPat}@github.com\n`;
  fs.writeFileSync(credPath, credContent, { mode: 0o600 });

  return credPath;
}

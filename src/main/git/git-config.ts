import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { GitConfig } from '@shared/types/git';
import type { KanbanAgentProvider } from '@shared/types/agent';

export type { GitConfig } from '@shared/types/git';

const VALID_PROVIDERS: KanbanAgentProvider[] = ['claude', 'opencode', 'codex', 'openrouter', 'xai'];

export function getGitConfigPath(): string {
  const settingsPath = path.join(os.homedir(), '.yolium', 'settings.json');
  const legacyPath = path.join(os.homedir(), '.yolium', 'gitconfig.json');

  if (!fs.existsSync(settingsPath) && fs.existsSync(legacyPath)) {
    fs.renameSync(legacyPath, settingsPath);
  }

  return settingsPath;
}

export function loadGitConfig(): GitConfig | null {
  const configPath = getGitConfigPath();

  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);

    if (typeof config === 'object' && config !== null) {
      const result: GitConfig = {
        name: typeof config.name === 'string' ? config.name : '',
        email: typeof config.email === 'string' ? config.email : '',
        ...(typeof config.githubPat === 'string' && config.githubPat ? { githubPat: config.githubPat } : {}),
        ...(typeof config.openaiApiKey === 'string' && config.openaiApiKey ? { openaiApiKey: config.openaiApiKey } : {}),
        ...(typeof config.anthropicApiKey === 'string' && config.anthropicApiKey ? { anthropicApiKey: config.anthropicApiKey } : {}),
        ...(typeof config.openrouterApiKey === 'string' && config.openrouterApiKey ? { openrouterApiKey: config.openrouterApiKey } : {}),
        ...(typeof config.xaiApiKey === 'string' && config.xaiApiKey ? { xaiApiKey: config.xaiApiKey } : {}),
        ...(typeof config.githubLogin === 'string' && config.githubLogin ? { githubLogin: config.githubLogin } : {}),
        ...(config.useClaudeOAuth === true ? { useClaudeOAuth: true } : {}),
        ...(config.useCodexOAuth === true ? { useCodexOAuth: true } : {}),
        ...(config.providerModelDefaults && typeof config.providerModelDefaults === 'object'
          ? { providerModelDefaults: config.providerModelDefaults }
          : {}),
        ...(config.providerModels && typeof config.providerModels === 'object'
          ? { providerModels: config.providerModels }
          : {}),
        ...(VALID_PROVIDERS.includes(config.defaultProvider as KanbanAgentProvider)
          ? { defaultProvider: config.defaultProvider as KanbanAgentProvider }
          : {}),
      };

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

      const hasMeaningful = result.name || result.email || result.githubPat || result.openaiApiKey || result.anthropicApiKey || result.openrouterApiKey || result.xaiApiKey || result.useClaudeOAuth || result.useCodexOAuth || result.providerModelDefaults || result.providerModels;
      return hasMeaningful ? result : null;
    }

    return null;
  } catch { /* Config file unreadable or contains invalid JSON — treat as no config. */
    return null;
  }
}

export function saveGitConfig(config: GitConfig): void {
  const configPath = getGitConfigPath();
  const configDir = path.dirname(configPath);

  fs.mkdirSync(configDir, { recursive: true });

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

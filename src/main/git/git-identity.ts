import { execSync } from 'node:child_process';
import type { GitConfig } from '@shared/types/git';
import { loadGitConfig } from './git-config';

export interface DetectedGitConfig extends GitConfig {
  sources: {
    name?: 'system' | 'environment' | 'yolium';
    email?: 'system' | 'environment' | 'yolium';
    githubPat?: 'system' | 'environment' | 'yolium';
    openaiApiKey?: 'system' | 'environment' | 'yolium';
    anthropicApiKey?: 'system' | 'environment' | 'yolium';
    openrouterApiKey?: 'system' | 'environment' | 'yolium';
  };
}

function loadSystemGitConfig(): Partial<GitConfig> | null {
  try {
    const name = execSync('git config --global user.name', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    const email = execSync('git config --global user.email', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();

    const config: Partial<GitConfig> = {};
    if (name) config.name = name;
    if (email) config.email = email;

    return Object.keys(config).length > 0 ? config : null;
  } catch { /* Git not available or no global config set */
    return null;
  }
}

function loadEnvironmentGitConfig(): Partial<GitConfig> | null {
  const config: Partial<GitConfig> = {};

  const name = process.env.GIT_AUTHOR_NAME || process.env.GIT_COMMITTER_NAME;
  const email = process.env.GIT_AUTHOR_EMAIL || process.env.GIT_COMMITTER_EMAIL;

  const githubPat = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (name) config.name = name;
  if (email) config.email = email;
  if (githubPat) config.githubPat = githubPat;
  if (openaiKey) config.openaiApiKey = openaiKey;
  if (anthropicKey) config.anthropicApiKey = anthropicKey;
  if (openrouterKey) config.openrouterApiKey = openrouterKey;

  return Object.keys(config).length > 0 ? config : null;
}

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

  if (yoliumConfig?.openrouterApiKey) {
    detected.openrouterApiKey = yoliumConfig.openrouterApiKey;
    detected.sources.openrouterApiKey = 'yolium';
    hasAnyConfig = true;
  } else if (envConfig?.openrouterApiKey) {
    detected.openrouterApiKey = envConfig.openrouterApiKey;
    detected.sources.openrouterApiKey = 'environment';
    hasAnyConfig = true;
  }

  return hasAnyConfig ? detected : null;
}

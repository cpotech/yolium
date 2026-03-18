import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadGitConfig } from '@main/git/git-config';
import type { GitConfig } from '@main/git/git-config';
import { refreshCodexOAuthTokenSerialized } from '@main/git/codex-oauth';
import { detectPackageManager, detectProjectTypes } from '@main/services/project-onboarding';
import { getValidatedSharedDirs } from '@main/services/project-config';
import { getContainerProjectPath, toContainerHomePath, toDockerPath } from './path-utils';
import { getClaudeOAuthBind, getCodexOAuthBind, getGitCredentialsBind } from './project-registry';
import { resolveToolDir } from '@main/services/tools-resolver';
import type { ServiceIntegration } from '@shared/types/schedule';

export const PROTECTED_ENV_VARS = new Set([
  'PROJECT_DIR',
  'TOOL',
  'PROJECT_TYPES',
  'NODE_PACKAGE_MANAGER',
  'AGENT_PROMPT',
  'AGENT_MODEL',
  'AGENT_TOOLS',
  'AGENT_ITEM_ID',
  'AGENT_NAME',
  'AGENT_PROVIDER',
  'AGENT_GOAL',
  'HOST_HOME',
  'OPENCODE_YOLO',
  'YOLIUM_NETWORK_FULL',
  'WORKTREE_REPO_PATH',
  'GIT_USER_NAME',
  'GIT_USER_EMAIL',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'CLAUDE_OAUTH_ENABLED',
  'CODEX_OAUTH_ENABLED',
]);

export function buildBindMounts(params: {
  mountPath: string;
  containerProjectPath: string;
  worktreePath?: string;
  originalPath?: string;
  gitCredentialsBind: string | null;
  claudeOAuthBind: string | null;
  codexOAuthBind: string | null;
  toolBinds?: string[];
}): string[] {
  const {
    mountPath,
    containerProjectPath,
    worktreePath,
    originalPath,
    gitCredentialsBind,
    claudeOAuthBind,
    codexOAuthBind,
    toolBinds,
  } = params;

  const binds = [`${toDockerPath(mountPath)}:${containerProjectPath}:rw`];

  if (worktreePath && originalPath) {
    const mainGitDir = path.join(originalPath, '.git');
    if (fs.existsSync(mainGitDir) && fs.statSync(mainGitDir).isDirectory()) {
      const dockerGitDir = toDockerPath(mainGitDir);
      const containerGitDir = toContainerHomePath(mainGitDir);
      binds.push(`${dockerGitDir}:${containerGitDir}:rw`);
    }

    const sharedDirs = getValidatedSharedDirs(originalPath);
    for (const dir of sharedDirs) {
      const hostDir = path.join(originalPath, dir);
      binds.push(`${toDockerPath(hostDir)}:${containerProjectPath}/${dir}:ro`);
    }
  }

  if (gitCredentialsBind) binds.push(gitCredentialsBind);
  if (claudeOAuthBind) binds.push(claudeOAuthBind);
  if (codexOAuthBind) binds.push(codexOAuthBind);

  if (toolBinds) {
    for (const bind of toolBinds) {
      binds.push(bind);
    }
  }

  return binds;
}

export function buildAgentEnv(params: {
  containerProjectPath: string;
  projectTypesValue: string;
  nodePackageManager: string | null;
  promptBase64: string;
  goalBase64?: string;
  model: string;
  tools: string[];
  itemId: string;
  agentName: string;
  agentProvider: string;
  worktreePath?: string;
  originalPath?: string;
  gitConfig: GitConfig | null;
  useOAuth: boolean;
  useCodexOAuth: boolean;
  specialistCredentials?: Record<string, Record<string, string>>;
}): string[] {
  const {
    containerProjectPath,
    projectTypesValue,
    nodePackageManager,
    promptBase64,
    goalBase64,
    model,
    tools,
    itemId,
    agentName,
    agentProvider,
    worktreePath,
    originalPath,
    gitConfig,
    useOAuth,
    useCodexOAuth,
    specialistCredentials,
  } = params;

  const env = [
    `PROJECT_DIR=${containerProjectPath}`,
    'TOOL=agent',
    ...(projectTypesValue ? [`PROJECT_TYPES=${projectTypesValue}`] : []),
    ...(nodePackageManager ? [`NODE_PACKAGE_MANAGER=${nodePackageManager}`] : []),
    `AGENT_PROMPT=${promptBase64}`,
    `AGENT_MODEL=${model}`,
    `AGENT_TOOLS=${tools.join(',')}`,
    `AGENT_ITEM_ID=${itemId}`,
    `AGENT_NAME=${agentName}`,
    `AGENT_PROVIDER=${agentProvider}`,
    ...(goalBase64 ? [`AGENT_GOAL=${goalBase64}`] : []),
    `HOST_HOME=${toContainerHomePath(os.homedir())}`,
    'OPENCODE_YOLO=true',
    ...(process.env.YOLIUM_NETWORK_FULL === 'true' ? ['YOLIUM_NETWORK_FULL=true'] : []),
    ...(worktreePath && originalPath ? [`WORKTREE_REPO_PATH=${toDockerPath(originalPath)}`] : []),
    ...(gitConfig?.name ? [`GIT_USER_NAME=${gitConfig.name}`] : []),
    ...(gitConfig?.email ? [`GIT_USER_EMAIL=${gitConfig.email}`] : []),
    ...(() => {
      if (useOAuth) return ['CLAUDE_OAUTH_ENABLED=true'];
      const key = gitConfig?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
      return key ? [`ANTHROPIC_API_KEY=${key}`] : [];
    })(),
    ...(() => {
      if (useCodexOAuth) return ['CODEX_OAUTH_ENABLED=true'];
      const key = gitConfig?.openaiApiKey || process.env.OPENAI_API_KEY;
      return key ? [`OPENAI_API_KEY=${key}`] : [];
    })(),
  ];

  if (specialistCredentials) {
    for (const creds of Object.values(specialistCredentials)) {
      for (const [key, value] of Object.entries(creds)) {
        if (!PROTECTED_ENV_VARS.has(key)) {
          env.push(`${key}=${value}`);
        }
      }
    }
  }

  return env;
}

export interface PreparedAgentContainerConfig {
  resolvedProjectPath: string;
  containerProjectPath: string;
  binds: string[];
  env: string[];
}

export async function prepareAgentContainerConfig(params: {
  projectPath: string;
  agentName: string;
  prompt: string;
  goal?: string;
  model: string;
  tools: string[];
  itemId: string;
  agentProvider?: string;
  worktreePath?: string;
  originalPath?: string;
  specialistCredentials?: Record<string, Record<string, string>>;
  integrations?: ServiceIntegration[];
}): Promise<PreparedAgentContainerConfig> {
  const {
    projectPath,
    agentName,
    prompt,
    goal,
    model,
    tools,
    itemId,
    agentProvider,
    worktreePath,
    originalPath,
    specialistCredentials,
    integrations,
  } = params;

  const resolvedProjectPath = path.resolve(projectPath);
  const mountPath = worktreePath || resolvedProjectPath;
  const containerProjectPath = getContainerProjectPath(mountPath);
  const projectTypesValue = detectProjectTypes(mountPath).join(',');
  const nodePackageManager = detectPackageManager(mountPath);

  const gitCredentialsBind = getGitCredentialsBind();
  const claudeOAuthBind = getClaudeOAuthBind();
  if (agentProvider === 'codex') {
    await refreshCodexOAuthTokenSerialized();
  }
  const codexOAuthBind = getCodexOAuthBind();

  // Resolve tool bind mounts from integrations
  const toolBinds: string[] = [];
  if (integrations) {
    for (const integration of integrations) {
      if (integration.tools) {
        for (const toolName of integration.tools) {
          const hostDir = resolveToolDir(toolName);
          if (hostDir) {
            toolBinds.push(`${toDockerPath(hostDir)}:/opt/tools/${toolName}:ro`);
          }
        }
      }
    }
  }

  const binds = buildBindMounts({
    mountPath,
    containerProjectPath,
    worktreePath,
    originalPath,
    gitCredentialsBind,
    claudeOAuthBind,
    codexOAuthBind,
    toolBinds,
  });

  const promptBase64 = Buffer.from(prompt).toString('base64');
  const goalBase64 = goal ? Buffer.from(goal).toString('base64') : undefined;
  const gitConfig = loadGitConfig();
  const useOAuth = !!(gitConfig?.useClaudeOAuth && claudeOAuthBind);
  const useCodexOAuth = !!(gitConfig?.useCodexOAuth && codexOAuthBind);

  const env = buildAgentEnv({
    containerProjectPath,
    projectTypesValue,
    nodePackageManager,
    promptBase64,
    goalBase64,
    model,
    tools,
    itemId,
    agentName,
    agentProvider: agentProvider || 'claude',
    worktreePath,
    originalPath,
    gitConfig,
    useOAuth,
    useCodexOAuth,
    specialistCredentials,
  });

  return {
    resolvedProjectPath,
    containerProjectPath,
    binds,
    env,
  };
}

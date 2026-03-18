/**
 * @module src/main/git/git-clone
 * Git clone service functions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import type { GitConfig } from '@shared/types/git';
import { loadGitConfig } from './git-config';
import { generateGitCredentials } from './git-credentials';

export interface GitCloneResult {
  success: boolean;
  clonedPath: string | null;
  error: string | null;
}

export const GIT_CLONE_TIMEOUT_MS = 5 * 60 * 1000;

export function expandHomePath(inputPath: string): string {
  return inputPath.startsWith('~')
    ? inputPath.replace(/^~(?=$|[\\/])/, os.homedir())
    : inputPath;
}

/**
 * Extract repository name from a git URL.
 * Supports HTTPS, SSH, and SCP-like git URL formats.
 */
export function extractRepoNameFromUrl(repoUrl: string): string | null {
  const trimmed = repoUrl.trim();
  if (!trimmed) return null;

  const withoutQuery = trimmed.replace(/[?#].*$/, '');
  const withoutTrailingSlash = withoutQuery.replace(/[\\/]+$/, '');
  const withoutDotGit = withoutTrailingSlash.replace(/\.git$/i, '');
  if (!withoutDotGit) return null;

  const scpLikeMatch = withoutDotGit.match(/^[^@\s]+@[^:\s]+:(.+)$/);
  if (scpLikeMatch?.[1]) {
    const repoName = path.posix.basename(scpLikeMatch[1]);
    return repoName && repoName !== '.' ? repoName : null;
  }

  try {
    const parsed = new URL(withoutDotGit);
    const pathname = parsed.pathname.replace(/^\/+/, '');
    const repoName = path.posix.basename(pathname);
    return repoName && repoName !== '.' ? repoName : null;
  } catch { /* not a valid URL — fall back to path-segment extraction */
    const segments = withoutDotGit.split(/[\\/]/).filter(Boolean);
    if (segments.length < 2) return null;
    return segments[segments.length - 1] ?? null;
  }
}

export function buildGitCloneEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const gitConfig = loadGitConfig();

  if (gitConfig?.githubPat) {
    const credPath = generateGitCredentials(gitConfig);
    if (credPath) {
      env.GIT_TERMINAL_PROMPT = '0';
      env.GIT_CONFIG_COUNT = '1';
      env.GIT_CONFIG_KEY_0 = 'credential.helper';
      env.GIT_CONFIG_VALUE_0 = `store --file "${credPath}"`;
    }
  }

  return env;
}

export function resolveCloneTargetPath(targetDir: string, repoName: string): string {
  const expanded = expandHomePath(targetDir.trim());
  if (!expanded) {
    return path.join(process.cwd(), repoName);
  }

  const endsWithSeparator = /[\\/]$/.test(expanded);
  if (endsWithSeparator) {
    return path.join(expanded, repoName);
  }

  try {
    if (fs.statSync(expanded).isDirectory()) {
      return path.join(expanded, repoName);
    }
  } catch { /* Path does not exist yet, treat as explicit target path. */
  }

  return expanded;
}

export async function runGitClone(url: string, targetPath: string, env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let progressOutput = '';

    const proc = execFile(
      'git',
      ['clone', url, targetPath],
      {
        env,
        timeout: GIT_CLONE_TIMEOUT_MS,
      },
      (error, _stdout, stderr) => {
        if (error) {
          const errorMessage = (stderr || progressOutput || error.message || 'Failed to clone repository').trim();
          reject(new Error(errorMessage));
          return;
        }
        resolve();
      },
    );

    proc.stderr?.on('data', (chunk: Buffer | string) => {
      progressOutput += chunk.toString();
    });
  });
}

export async function cloneRepository(url: string, targetDir: string): Promise<GitCloneResult> {
  const repoName = extractRepoNameFromUrl(url);
  if (!repoName) {
    return { success: false, clonedPath: null, error: 'Invalid repository URL' };
  }

  const targetPath = resolveCloneTargetPath(targetDir, repoName);
  const parentDirectory = path.dirname(targetPath);

  if (fs.existsSync(targetPath)) {
    return { success: false, clonedPath: null, error: `Target already exists: ${targetPath}` };
  }

  if (!fs.existsSync(parentDirectory)) {
    return { success: false, clonedPath: null, error: `Parent directory does not exist: ${parentDirectory}` };
  }

  try {
    const env = buildGitCloneEnv();
    await runGitClone(url.trim(), targetPath, env);
    return { success: true, clonedPath: targetPath, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to clone repository';
    return { success: false, clonedPath: null, error: message };
  }
}
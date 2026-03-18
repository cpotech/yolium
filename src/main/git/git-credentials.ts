import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { GitConfig } from '@shared/types/git';

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
  } catch { /* Network error or unexpected API response — caller treats null as unauthenticated. */
    return null;
  }
}

export function getGitCredentialsPath(): string {
  return path.join(os.homedir(), '.yolium', 'git-credentials');
}

export function generateGitCredentials(gitConfig: GitConfig | null): string | null {
  if (!gitConfig?.githubPat) {
    return null;
  }

  const credPath = getGitCredentialsPath();
  const credDir = path.dirname(credPath);

  fs.mkdirSync(credDir, { recursive: true });

  const pat = gitConfig.githubPat.replace(/@github\.com$/, '');
  const credContent = `https://git:${pat}@github.com\n`;
  fs.writeFileSync(credPath, credContent, { mode: 0o600 });

  return credPath;
}

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ClaudeUsageData } from '@shared/types/agent';

const CLAUDE_TOKEN_ENDPOINT = 'https://claude.ai/oauth/token';

export function hasHostClaudeOAuth(): boolean {
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    if (!fs.existsSync(credPath)) return false;
    const content = fs.readFileSync(credPath, 'utf-8');
    const creds = JSON.parse(content);
    return !!(creds?.claudeAiOauth?.accessToken);
  } catch { /* Credentials file missing, unreadable, or malformed — treat as no OAuth. */
    return false;
  }
}

export async function refreshClaudeOAuthToken(): Promise<boolean> {
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    if (!fs.existsSync(credPath)) return false;

    const content = fs.readFileSync(credPath, 'utf-8');
    const creds = JSON.parse(content);

    const refreshToken = creds?.claudeAiOauth?.refreshToken;
    if (!refreshToken) return false;

    const response = await fetch(CLAUDE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      console.warn(`[git-config] Claude OAuth refresh failed: ${response.status} ${response.statusText}`);
      return false;
    }

    const data = await response.json();

    creds.claudeAiOauth.accessToken = data.access_token;
    if (data.refresh_token) {
      creds.claudeAiOauth.refreshToken = data.refresh_token;
    }

    fs.writeFileSync(credPath, JSON.stringify(creds, null, 2), { encoding: 'utf-8', mode: 0o600 });
    return true;
  } catch (err) {
    console.warn('[git-config] Claude OAuth refresh error:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

let claudeRefreshLock: Promise<boolean> | null = null;

export async function refreshClaudeOAuthTokenSerialized(): Promise<boolean> {
  if (claudeRefreshLock) return claudeRefreshLock;
  claudeRefreshLock = refreshClaudeOAuthToken().finally(() => {
    claudeRefreshLock = null;
  });
  return claudeRefreshLock;
}

export async function fetchClaudeUsage(): Promise<ClaudeUsageData | null> {
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    if (!fs.existsSync(credPath)) return null;

    let content = fs.readFileSync(credPath, 'utf-8');
    let creds = JSON.parse(content);
    let accessToken = creds?.claudeAiOauth?.accessToken;

    if (!accessToken) return null;

    let response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
    });

    if (response.status === 401) {
      const refreshed = await refreshClaudeOAuthTokenSerialized();
      if (refreshed) {
        content = fs.readFileSync(credPath, 'utf-8');
        creds = JSON.parse(content);
        accessToken = creds?.claudeAiOauth?.accessToken;
        if (accessToken) {
          response = await fetch('https://api.anthropic.com/api/oauth/usage', {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'anthropic-beta': 'oauth-2025-04-20',
            },
          });
        }
      }
    }

    if (!response.ok) return null;

    const data = await response.json();

    return {
      fiveHour: {
        utilization: data.five_hour?.utilization ?? 0,
        resetsAt: data.five_hour?.resets_at ?? '',
      },
      sevenDay: {
        utilization: data.seven_day?.utilization ?? 0,
        resetsAt: data.seven_day?.resets_at ?? '',
      },
    };
  } catch { /* Network error, credential file unreadable, or malformed JSON — usage data unavailable. */
    return null;
  }
}

export function getHostClaudeCredentialsPath(): string | null {
  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
  try {
    if (fs.statSync(credPath).isFile()) {
      return credPath;
    }
  } catch { /* File doesn't exist */
  }
  return null;
}

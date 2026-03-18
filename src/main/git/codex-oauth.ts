import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const CODEX_TOKEN_ENDPOINT = 'https://auth.openai.com/oauth/token';
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

export function hasHostCodexOAuth(): boolean {
  try {
    const authPath = path.join(os.homedir(), '.codex', 'auth.json');
    if (!fs.existsSync(authPath)) return false;
    const content = fs.readFileSync(authPath, 'utf-8');
    const auth = JSON.parse(content);
    return auth?.auth_mode === 'chatgpt' && !!(auth?.tokens?.access_token);
  } catch { /* Credentials file missing, unreadable, or malformed — treat as no OAuth. */
    return false;
  }
}

export async function refreshCodexOAuthToken(): Promise<boolean> {
  try {
    const authPath = path.join(os.homedir(), '.codex', 'auth.json');
    if (!fs.existsSync(authPath)) return false;

    const content = fs.readFileSync(authPath, 'utf-8');
    const auth = JSON.parse(content);

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

    auth.tokens.access_token = data.access_token;
    auth.tokens.refresh_token = data.refresh_token;
    if (data.id_token) {
      auth.tokens.id_token = data.id_token;
    }
    auth.last_refresh = new Date().toISOString();

    fs.writeFileSync(authPath, JSON.stringify(auth, null, 2), { encoding: 'utf-8', mode: 0o600 });
    return true;
  } catch (err) {
    console.warn('[git-config] Codex OAuth refresh error:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

let codexRefreshLock: Promise<boolean> | null = null;

export async function refreshCodexOAuthTokenSerialized(): Promise<boolean> {
  if (codexRefreshLock) return codexRefreshLock;
  codexRefreshLock = refreshCodexOAuthToken().finally(() => {
    codexRefreshLock = null;
  });
  return codexRefreshLock;
}

export function getHostCodexCredentialsPath(): string | null {
  const authPath = path.join(os.homedir(), '.codex', 'auth.json');
  try {
    if (fs.statSync(authPath).isFile()) {
      return authPath;
    }
  } catch { /* File doesn't exist */
  }
  return null;
}

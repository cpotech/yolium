import { describe, it, expect } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';

const SCRIPT = path.resolve(__dirname, '..', 'tools', 'twitter', 'post_tweet.py');
const DB_PATH = path.join(os.homedir(), '.yolium', 'yolium.db');
const SPECIALIST_ID = 'reply-focused-privacybooks';

function loadCredentialsEnv(): Record<string, string> {
  const output = execFileSync('sqlite3', [
    DB_PATH,
    '-json',
    `SELECT key, value FROM credentials WHERE specialist_id = '${SPECIALIST_ID}'`,
  ], { encoding: 'utf-8' });

  const rows = JSON.parse(output) as { key: string; value: string }[];
  const env: Record<string, string> = {};
  for (const row of rows) {
    env[row.key] = row.value;
  }
  return env;
}

function run(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = execFile(
      'python3',
      [SCRIPT, ...args],
      {
        env: { ...env, PATH: process.env.PATH ?? '' },
        timeout: 30_000,
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? '',
          exitCode: error ? (error as any).code ?? proc.exitCode ?? 1 : 0,
        });
      },
    );
  });
}

describe('post_tweet.py with real credentials', () => {
  it('should load credentials for reply-focused-privacybooks from the database', () => {
    const env = loadCredentialsEnv();
    expect(env.TWITTER_API_KEY).toBeDefined();
    expect(env.TWITTER_API_KEY.length).toBeGreaterThan(0);
    expect(env.TWITTER_API_SECRET).toBeDefined();
    expect(env.TWITTER_ACCESS_TOKEN).toBeDefined();
    expect(env.TWITTER_ACCESS_TOKEN_SECRET).toBeDefined();
  });

  it('should dry-run a tweet successfully', async () => {
    const env = loadCredentialsEnv();
    const tweetText = `Test tweet from Yolium integration test - ${Date.now()}`;

    const result = await run(
      ['--dry-run', tweetText],
      env,
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);
    expect(output.dry_run).toBe(true);
    expect(output.text).toBe(tweetText);
    expect(output.tweet_id).toMatch(/^dry-run-/);
  });

});

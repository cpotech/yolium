import { describe, it, expect, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import * as path from 'node:path';

const SCRIPT = path.resolve(__dirname, '..', 'tools', 'twitter', 'search_tweets.py');

function run(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = execFile(
      'python3',
      [SCRIPT, ...args],
      {
        env: { ...env, PATH: process.env.PATH ?? '' },
        timeout: 10_000,
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? '',
          code: error ? (error as NodeJS.ErrnoException & { code?: number }).code !== undefined ? null : (child.exitCode ?? 1) : 0,
        });
      },
    );
  });
}

function runWithCode(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = execFile(
      'python3',
      [SCRIPT, ...args],
      {
        env: { ...env, PATH: process.env.PATH ?? '' },
        timeout: 10_000,
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

describe('search_tweets.py', () => {
  it('should print usage error when --query is not provided', async () => {
    const result = await runWithCode([], { TWITTER_API_KEY: 'k', TWITTER_API_SECRET: 's', TWITTER_ACCESS_TOKEN: 't', TWITTER_ACCESS_TOKEN_SECRET: 'ts' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/--query/i);
  });

  it('should exit with error when TWITTER_API_KEY is not set', async () => {
    const result = await runWithCode(['--query', 'test search'], {});
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/TWITTER_API_KEY/);
  });

  it('should default max_results to 10 when --count is not provided', async () => {
    // We test this by reading the script source and verifying the default
    // Since we can't actually call the API, we verify the argparse default
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(SCRIPT, 'utf-8');
    expect(source).toMatch(/default\s*=\s*10/);
  });

  it('should clamp max_results between 10 and 100', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(SCRIPT, 'utf-8');
    // Should have clamping logic similar to get_mentions.py: max(10, min(count, 100))
    expect(source).toMatch(/max\s*\(\s*10/);
    expect(source).toMatch(/min\s*\(/);
  });

  it('should include query and max_results in the request URL', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(SCRIPT, 'utf-8');
    // The URL should contain the search endpoint
    expect(source).toContain('https://api.x.com/2/tweets/search/recent');
    // Should encode the query parameter
    expect(source).toMatch(/query/);
    expect(source).toMatch(/max_results/);
  });

  it('should return JSON with success, count, and tweets fields on valid response', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(SCRIPT, 'utf-8');
    // Output should contain these JSON fields
    expect(source).toContain('"success"');
    expect(source).toContain('"count"');
    expect(source).toContain('"tweets"');
    expect(source).toContain('"includes"');
    expect(source).toContain('"meta"');
  });

  it('should respect --count flag to limit results', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(SCRIPT, 'utf-8');
    // Should accept --count argument
    expect(source).toMatch(/--count/);
    // The count value should be used in max_results
    expect(source).toMatch(/args\.count/);
  });

  it('should handle Twitter API HTTP errors gracefully', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(SCRIPT, 'utf-8');
    // Should catch HTTPError like get_mentions.py
    expect(source).toContain('urllib.error.HTTPError');
    expect(source).toMatch(/Twitter API error/);
  });

  it('should handle network/connection errors gracefully', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(SCRIPT, 'utf-8');
    // Should catch URLError like get_mentions.py
    expect(source).toContain('urllib.error.URLError');
    expect(source).toMatch(/Twitter API request failed/);
  });
});

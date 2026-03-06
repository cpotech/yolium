/**
 * Tests for Dockerfile version pinning patterns.
 *
 * Verifies that NVM and glab versions are pinned via ARG defaults
 * rather than fetched dynamically from GitHub/GitLab APIs, and that
 * curl uses fail-fast flags to catch HTTP errors during build.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const dockerDir = path.join(__dirname, '../docker');

describe('Dockerfile version pinning', () => {
  let dockerfileContent: string;

  beforeAll(() => {
    dockerfileContent = fs.readFileSync(path.join(dockerDir, 'Dockerfile'), 'utf-8');
  });

  it('should use a pinned NVM version ARG instead of fetching from GitHub API', () => {
    // Must have a pinned ARG default
    expect(dockerfileContent).toMatch(/ARG NVM_VERSION=v[\d.]+/);

    // Must NOT call the GitHub API to resolve the latest version
    expect(dockerfileContent).not.toContain('api.github.com/repos/nvm-sh/nvm');
  });

  it('should use a pinned glab version ARG instead of fetching from GitLab API', () => {
    // Must have a pinned ARG default
    expect(dockerfileContent).toMatch(/ARG GLAB_VERSION=[\d.]+/);

    // Must NOT call the GitLab API to resolve the latest version
    expect(dockerfileContent).not.toContain('gitlab.com/api/v4/projects/34675721');
  });

  it('should fail the build if pinned version download fails (curl -f flag)', () => {
    // The NVM install curl must use -f (fail on HTTP errors)
    // Find the line that downloads the NVM install script
    const nvmInstallLine = dockerfileContent
      .split('\n')
      .find(line => line.includes('nvm-sh/nvm') && line.includes('install.sh'));
    expect(nvmInstallLine).toBeDefined();
    expect(nvmInstallLine).toMatch(/curl\s+[^\n]*-[a-zA-Z]*f/);
  });
});

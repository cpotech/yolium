import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  detectProjectTypes,
  detectPackageManager,
  generateGitignore,
  generateProjectContext,
  validatePreFlight,
  validatePreFlightWithAdapters,
} from '@main/services/project-onboarding';

type StatFsResult = ReturnType<typeof fs.statfsSync>;

function createTempProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yolium-onboarding-test-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
  return dir;
}

describe('project-onboarding service', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects all supported project types from marker files', () => {
    const projectDir = createTempProject({
      'package.json': '{}',
      'requirements.txt': '',
      'Cargo.toml': '[package]',
      'go.mod': 'module github.com/example/project',
      'pom.xml': '<project />',
      'build.gradle': 'plugins {}',
      'app.sln': '',
    });
    tempDirs.push(projectDir);

    const result = detectProjectTypes(projectDir);

    expect(result).toEqual(expect.arrayContaining([
      'nodejs',
      'python',
      'rust',
      'go',
      'java-maven',
      'java-gradle',
      'dotnet',
    ]));
  });

  it('detects node package manager from lock files with expected precedence', () => {
    const pnpmProject = createTempProject({
      'package.json': '{}',
      'pnpm-lock.yaml': '',
      'yarn.lock': '',
      'package-lock.json': '',
    });
    const yarnProject = createTempProject({
      'package.json': '{}',
      'yarn.lock': '',
      'package-lock.json': '',
    });
    const npmProject = createTempProject({
      'package.json': '{}',
      'package-lock.json': '',
    });
    tempDirs.push(pnpmProject, yarnProject, npmProject);

    expect(detectPackageManager(pnpmProject)).toBe('pnpm');
    expect(detectPackageManager(yarnProject)).toBe('yarn');
    expect(detectPackageManager(npmProject)).toBe('npm');
  });

  it('generates merged gitignore content for multiple project types', () => {
    const gitignore = generateGitignore(['nodejs', 'python']);

    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('__pycache__/');
    expect(gitignore).toContain('.env');
  });

  it('generates project context from README, CLAUDE.md, and AGENTS.md', () => {
    const projectDir = createTempProject({
      'README.md': '# Demo Project',
      'CLAUDE.md': 'Project-specific Claude instructions.',
      'AGENTS.md': 'Agent collaboration rules.',
    });
    tempDirs.push(projectDir);

    const context = generateProjectContext(projectDir);

    expect(context).toContain('## README.md');
    expect(context).toContain('## CLAUDE.md');
    expect(context).toContain('## AGENTS.md');
    expect(context).toContain('Demo Project');
    expect(context).toContain('Project-specific Claude instructions.');
    expect(context).toContain('Agent collaboration rules.');
  });

  it('returns pre-flight errors for low disk space and unwritable project path', () => {
    const projectDir = createTempProject({ 'README.md': '# Demo' });
    tempDirs.push(projectDir);

    const result = validatePreFlightWithAdapters(projectDir, {
      accessSync: () => {
        throw new Error('EACCES');
      },
      statfsSync: () => ({
        bavail: 128,
        bsize: 1024,
      } as unknown as StatFsResult),
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Project directory is not writable.');
    expect(result.errors).toContain('Insufficient disk space. At least 1 GB is required.');
  });

  it('passes pre-flight validation when disk space and permissions are healthy', () => {
    const projectDir = createTempProject({ 'README.md': '# Demo' });
    tempDirs.push(projectDir);

    const result = validatePreFlightWithAdapters(projectDir, {
      accessSync: () => undefined,
      statfsSync: () => ({
        bavail: 2 * 1024 * 1024,
        bsize: 1024,
      } as unknown as StatFsResult),
    });

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.availableDiskBytes).toBeGreaterThan(1024 * 1024 * 1024);
  });
});

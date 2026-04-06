import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron before any imports
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/tmp', getPath: () => '/tmp' },
}));

// Mock node:fs before importing modules
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  readdirSync: vi.fn(() => []),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

// Mock node-cron validate
vi.mock('node-cron', () => {
  const validateFn = vi.fn((expr: string) => {
    if (!expr || typeof expr !== 'string') return false;
    const parts = expr.trim().split(/\s+/);
    return parts.length >= 5 && parts.length <= 6;
  });
  return { default: { validate: validateFn }, validate: validateFn };
});

// Mock kanban-db for resolveSpecialistProjects tests
const mockGetAllProjectPaths = vi.fn<() => string[]>(() => []);
vi.mock('@main/stores/kanban-db', () => ({
  getAllProjectPaths: () => mockGetAllProjectPaths(),
}));

// Mock registry-db for resolveSpecialistProjects tests
const mockGetAllRegisteredPaths = vi.fn<() => string[]>(() => []);
vi.mock('@main/stores/registry-db', () => ({
  getAllRegisteredPaths: () => mockGetAllRegisteredPaths(),
}));

// Mock heavy dependencies pulled in by agent-scheduled
vi.mock('@main/services/agent-protocol', () => ({
  extractProtocolMessages: vi.fn(() => []),
}));
vi.mock('@main/services/agent-prompts', () => ({
  buildScheduledPrompt: vi.fn(() => ''),
}));
vi.mock('@main/services/agent-model', () => ({
  resolveModel: vi.fn(() => 'sonnet'),
}));
vi.mock('@main/services/specialist-readiness', () => ({
  checkSpecialistReadiness: vi.fn(() => ({ ready: true, reasons: [] })),
}));
vi.mock('@main/services/tools-resolver', () => ({
  resolveToolDir: vi.fn(() => null),
}));
vi.mock('@main/git/git-config', () => ({
  loadGitConfig: vi.fn(() => null),
}));
vi.mock('@main/docker', () => ({
  createAgentContainer: vi.fn(),
  checkAgentAuth: vi.fn(() => ({ authenticated: true })),
  getAgentSession: vi.fn(),
  ensureImage: vi.fn(),
}));
vi.mock('@main/stores/yolium-db', () => ({
  appendRunLog: vi.fn(),
  appendAction: vi.fn(),
  loadCredentials: vi.fn(() => ({})),
  pruneCredentials: vi.fn(() => 0),
}));

import * as fs from 'node:fs';
import { parseSpecialistDefinition } from '@main/services/specialist-loader';
import { resolveSpecialistProjects } from '@main/services/agent-scheduled';

const MINIMAL_FRONTMATTER = `---
name: test-agent
description: Test agent
model: sonnet
tools:
  - Read
  - Bash
schedules:
  - type: daily
    cron: "0 9 * * *"
    enabled: true
memory:
  strategy: raw
  maxEntries: 100
  retentionDays: 30
escalation:
  onFailure: alert_user
`;

function makeMarkdown(extraYaml: string, body = '# Test Agent\n\nYou are a test agent.'): string {
  return `${MINIMAL_FRONTMATTER}${extraYaml}---\n\n${body}`;
}

describe('specialist-loader projects field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse projects field as string array from YAML frontmatter', () => {
    const md = makeMarkdown('projects:\n  - /home/user/project-a\n  - /home/user/project-b\n');
    const result = parseSpecialistDefinition(md);
    expect(result.projects).toEqual(['/home/user/project-a', '/home/user/project-b']);
  });

  it('should return undefined projects when field is not present', () => {
    const md = makeMarkdown('');
    const result = parseSpecialistDefinition(md);
    expect(result.projects).toBeUndefined();
  });

  it('should handle projects: ["all"] correctly', () => {
    const md = makeMarkdown('projects:\n  - all\n');
    const result = parseSpecialistDefinition(md);
    expect(result.projects).toEqual(['all']);
  });

  it('should reject non-array projects field gracefully', () => {
    const md = makeMarkdown('projects: not-an-array\n');
    const result = parseSpecialistDefinition(md);
    expect(result.projects).toBeUndefined();
  });
});

describe('resolveSpecialistProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return explicit paths that exist', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return p === '/home/user/project-a' || p === '/home/user/project-b';
    });
    const result = resolveSpecialistProjects(['/home/user/project-a', '/home/user/project-b']);
    expect(result).toEqual(['/home/user/project-a', '/home/user/project-b']);
  });

  it('should filter out non-existent paths', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return p === '/home/user/project-a';
    });
    const result = resolveSpecialistProjects(['/home/user/project-a', '/home/user/gone']);
    expect(result).toEqual(['/home/user/project-a']);
  });

  it('should resolve "all" to merged kanban + registry paths', () => {
    mockGetAllProjectPaths.mockReturnValue(['/home/user/proj1', '/home/user/proj2']);
    mockGetAllRegisteredPaths.mockReturnValue(['/home/user/proj3', '/home/user/proj4']);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const result = resolveSpecialistProjects(['all']);
    expect(result).toEqual(['/home/user/proj1', '/home/user/proj2', '/home/user/proj3', '/home/user/proj4']);
  });

  it('should deduplicate paths across kanban and registry sources', () => {
    mockGetAllProjectPaths.mockReturnValue(['/home/user/proj1', '/home/user/shared']);
    mockGetAllRegisteredPaths.mockReturnValue(['/home/user/shared', '/home/user/proj2']);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const result = resolveSpecialistProjects(['all']);
    expect(result).toEqual(['/home/user/proj1', '/home/user/shared', '/home/user/proj2']);
  });

  it('should return registry paths even when kanban boards is empty', () => {
    mockGetAllProjectPaths.mockReturnValue([]);
    mockGetAllRegisteredPaths.mockReturnValue(['/home/user/proj1', '/home/user/proj2']);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const result = resolveSpecialistProjects(['all']);
    expect(result).toEqual(['/home/user/proj1', '/home/user/proj2']);
  });

  it('should filter non-existent paths from registry source', () => {
    mockGetAllProjectPaths.mockReturnValue(['/home/user/proj1']);
    mockGetAllRegisteredPaths.mockReturnValue(['/home/user/proj2', '/home/user/gone']);
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return p === '/home/user/proj1' || p === '/home/user/proj2';
    });
    const result = resolveSpecialistProjects(['all']);
    expect(result).toEqual(['/home/user/proj1', '/home/user/proj2']);
  });

  it('should handle both sources returning empty arrays', () => {
    mockGetAllProjectPaths.mockReturnValue([]);
    mockGetAllRegisteredPaths.mockReturnValue([]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const result = resolveSpecialistProjects(['all']);
    expect(result).toEqual([]);
  });

  it('should deduplicate paths', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const result = resolveSpecialistProjects(['/home/user/proj', '/home/user/proj']);
    expect(result).toEqual(['/home/user/proj']);
  });

  it('should return empty array when no projects defined', () => {
    const result = resolveSpecialistProjects([]);
    expect(result).toEqual([]);
  });
});

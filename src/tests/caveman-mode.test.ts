import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
  writeFileSync: vi.fn(),
}));

import * as fs from 'node:fs';
import {
  CAVEMAN_DIRECTIVES,
  buildCavemanDirective,
  resolveCavemanMode,
} from '@main/services/caveman-mode';
import type { KanbanItem } from '@shared/types/kanban';

const PRESERVATION_RE = /code blocks.*file paths.*identifiers.*@@YOLIUM:/is;

function makeItem(overrides: Partial<KanbanItem> = {}): KanbanItem {
  return {
    id: 'item-1',
    title: 't',
    description: '',
    column: 'backlog',
    agentProvider: 'claude',
    order: 0,
    agentStatus: 'idle',
    comments: [],
    createdAt: '2026-04-22T00:00:00Z',
    updatedAt: '2026-04-22T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildCavemanDirective', () => {
  it('returns an empty string for off', () => {
    expect(buildCavemanDirective('off')).toBe('');
  });

  it('returns a non-empty string for lite, full, and ultra', () => {
    expect(buildCavemanDirective('lite').length).toBeGreaterThan(0);
    expect(buildCavemanDirective('full').length).toBeGreaterThan(0);
    expect(buildCavemanDirective('ultra').length).toBeGreaterThan(0);
  });

  it('includes the preservation clause for code, paths, identifiers, and @@YOLIUM: JSON on every non-off level', () => {
    expect(buildCavemanDirective('lite')).toMatch(PRESERVATION_RE);
    expect(buildCavemanDirective('full')).toMatch(PRESERVATION_RE);
    expect(buildCavemanDirective('ultra')).toMatch(PRESERVATION_RE);
  });

  it('orders full shorter-in-effect than ultra (ultra directive is stricter than full)', () => {
    // Ultra should impose stricter limits than full; we express this as ultra
    // mentioning stronger terseness terms than full.
    const full = buildCavemanDirective('full').toLowerCase();
    const ultra = buildCavemanDirective('ultra').toLowerCase();
    expect(ultra).toContain('fragment');
    expect(ultra).toMatch(/minimum|absolute/);
    // Full should allow at least imperatives / sentence-like output
    expect(full).toMatch(/imperative|fragment|short/);
    // Sanity: ultra and full text differ
    expect(ultra).not.toBe(full);
  });

  it('CAVEMAN_DIRECTIVES map matches buildCavemanDirective output', () => {
    expect(CAVEMAN_DIRECTIVES.off).toBe('');
    expect(CAVEMAN_DIRECTIVES.lite).toBe(buildCavemanDirective('lite'));
    expect(CAVEMAN_DIRECTIVES.full).toBe(buildCavemanDirective('full'));
    expect(CAVEMAN_DIRECTIVES.ultra).toBe(buildCavemanDirective('ultra'));
  });
});

describe('resolveCavemanMode', () => {
  it('returns off when neither item nor project specify', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });
    expect(resolveCavemanMode(makeItem(), '/home/user/project')).toBe('off');
  });

  it('returns the project mode when item has no cavemanMode', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{"cavemanMode":"lite"}');
    expect(resolveCavemanMode(makeItem(), '/home/user/project')).toBe('lite');
  });

  it('returns the project mode when item cavemanMode is "inherit"', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{"cavemanMode":"full"}');
    expect(
      resolveCavemanMode(makeItem({ cavemanMode: 'inherit' }), '/home/user/project'),
    ).toBe('full');
  });

  it('returns the item mode when item has a concrete level (overrides project)', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{"cavemanMode":"lite"}');
    expect(
      resolveCavemanMode(makeItem({ cavemanMode: 'ultra' }), '/home/user/project'),
    ).toBe('ultra');
  });

  it('returns off when item explicitly sets off even if project is full', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{"cavemanMode":"full"}');
    expect(
      resolveCavemanMode(makeItem({ cavemanMode: 'off' }), '/home/user/project'),
    ).toBe('off');
  });

  it('falls back to off when .yolium.json is missing', () => {
    const err = new Error('ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw err; });
    expect(resolveCavemanMode(makeItem(), '/home/user/project')).toBe('off');
  });

  it('falls back to off when .yolium.json is unreadable/invalid JSON', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('not json');
    expect(resolveCavemanMode(makeItem(), '/home/user/project')).toBe('off');
  });
});

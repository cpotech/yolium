import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

vi.mock('@main/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
  };
});

import { buildAgentPrompt } from '@main/services/agent-prompts';

describe('buildAgentPrompt — caveman mode', () => {
  const base = {
    systemPrompt: 'You are the Code Agent.',
    goal: 'Fix bug',
    conversationHistory: '',
  } as const;

  it('cavemanMode="off" produces byte-identical output to cavemanMode undefined (Claude path)', () => {
    const withOff = buildAgentPrompt({ ...base, cavemanMode: 'off' });
    const withUndefined = buildAgentPrompt({ ...base });
    expect(withOff).toBe(withUndefined);
  });

  it('cavemanMode="off" produces byte-identical output to cavemanMode undefined (non-Claude path)', () => {
    const withOff = buildAgentPrompt({ ...base, provider: 'codex', cavemanMode: 'off' });
    const withUndefined = buildAgentPrompt({ ...base, provider: 'codex' });
    expect(withOff).toBe(withUndefined);
  });

  it('cavemanMode="full" on Claude path inserts directive before ## Current Goal', () => {
    const prompt = buildAgentPrompt({ ...base, cavemanMode: 'full' });
    const directiveIdx = prompt.search(/caveman/i);
    const goalIdx = prompt.indexOf('## Current Goal');
    expect(directiveIdx).toBeGreaterThanOrEqual(0);
    expect(goalIdx).toBeGreaterThanOrEqual(0);
    expect(directiveIdx).toBeLessThan(goalIdx);
  });

  it('cavemanMode="full" on non-Claude path inserts directive before ## Current Goal', () => {
    const prompt = buildAgentPrompt({ ...base, provider: 'codex', cavemanMode: 'full' });
    const directiveIdx = prompt.search(/caveman/i);
    const goalIdx = prompt.indexOf('## Current Goal');
    expect(directiveIdx).toBeGreaterThanOrEqual(0);
    expect(goalIdx).toBeGreaterThanOrEqual(0);
    expect(directiveIdx).toBeLessThan(goalIdx);
  });

  it('cavemanMode="ultra" includes ultra-level text (distinguishable from full)', () => {
    const full = buildAgentPrompt({ ...base, cavemanMode: 'full' });
    const ultra = buildAgentPrompt({ ...base, cavemanMode: 'ultra' });
    expect(ultra).not.toBe(full);
    expect(ultra.toLowerCase()).toContain('fragment');
  });

  it('cavemanMode="lite" still includes the @@YOLIUM: preservation clause', () => {
    const prompt = buildAgentPrompt({ ...base, cavemanMode: 'lite' });
    expect(prompt).toMatch(/@@YOLIUM:/);
    // Preservation sentence must mention code blocks, paths, identifiers, and @@YOLIUM: together
    expect(prompt).toMatch(/code blocks.*file paths.*identifiers.*@@YOLIUM:/is);
  });

  it('does not mutate the input systemPrompt', () => {
    const original = 'You are the Code Agent.';
    const params = { ...base, systemPrompt: original, cavemanMode: 'full' as const };
    buildAgentPrompt(params);
    expect(params.systemPrompt).toBe(original);
  });
});

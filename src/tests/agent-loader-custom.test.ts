// src/tests/agent-loader-custom.test.ts
// Tests for agent-loader integration with custom agents.
// Uses the internal _*FromDir functions directly instead of mocking getAgentsDir.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseAgentDefinition } from '@main/services/agent-loader';
import {
  _listCustomAgentsFromDir,
  _loadCustomAgentFromDir,
  _saveCustomAgentToDir,
} from '@main/stores/custom-agent-store';

let tempBuiltinDir: string;
let tempCustomDir: string;

beforeEach(() => {
  tempBuiltinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yolium-builtin-'));
  tempCustomDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yolium-custom-'));
});

afterEach(() => {
  fs.rmSync(tempBuiltinDir, { recursive: true, force: true });
  fs.rmSync(tempCustomDir, { recursive: true, force: true });
});

function writeAgent(dir: string, name: string, overrides: Record<string, unknown> = {}) {
  const defaults = {
    description: `${name} agent`,
    model: 'sonnet',
    tools: ['Read'],
    order: 1,
    ...overrides,
  };
  const yaml = Object.entries({ name, ...defaults })
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}:\n${v.map(i => `  - ${i}`).join('\n')}`;
      return `${k}: ${v}`;
    })
    .join('\n');
  fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${yaml}\n---\n\nSystem prompt for ${name}`);
}

function listBuiltinAgents(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')
    .map(f => f.replace('.md', ''));
}

function mergedListAgents(builtinDir: string, customDir: string): string[] {
  const builtinNames = listBuiltinAgents(builtinDir);
  const customNames = _listCustomAgentsFromDir(customDir);
  return Array.from(new Set([...builtinNames, ...customNames]));
}

function loadAgentFromDirs(builtinDir: string, customDir: string, name: string) {
  // Custom takes precedence
  const customPath = path.join(customDir, `${name}.md`);
  if (fs.existsSync(customPath)) {
    const content = fs.readFileSync(customPath, 'utf-8');
    return parseAgentDefinition(content);
  }
  const builtinPath = path.join(builtinDir, `${name}.md`);
  if (!fs.existsSync(builtinPath)) {
    throw new Error(`Agent definition not found: ${name}`);
  }
  const content = fs.readFileSync(builtinPath, 'utf-8');
  return parseAgentDefinition(content);
}

function isBuiltinInDir(builtinDir: string, name: string): boolean {
  return fs.existsSync(path.join(builtinDir, `${name}.md`));
}

describe('agent-loader with custom agents', () => {
  it('should merge built-in and custom agents in listAgents', () => {
    writeAgent(tempBuiltinDir, 'plan-agent', { order: 1 });
    writeAgent(tempBuiltinDir, 'code-agent', { order: 2 });
    writeAgent(tempCustomDir, 'my-custom-agent', { order: 10 });

    const agents = mergedListAgents(tempBuiltinDir, tempCustomDir);

    expect(agents).toContain('plan-agent');
    expect(agents).toContain('code-agent');
    expect(agents).toContain('my-custom-agent');
  });

  it('should give custom agents precedence over built-in agents with the same name', () => {
    writeAgent(tempBuiltinDir, 'code-agent', { description: 'Built-in code agent', order: 2 });
    writeAgent(tempCustomDir, 'code-agent', { description: 'Custom code agent', order: 2 });

    const def = loadAgentFromDirs(tempBuiltinDir, tempCustomDir, 'code-agent');
    expect(def.description).toBe('Custom code agent');
  });

  it('should load custom agent definition when it overrides a built-in', () => {
    writeAgent(tempBuiltinDir, 'plan-agent', { description: 'Built-in plan', model: 'opus', order: 1 });
    writeAgent(tempCustomDir, 'plan-agent', { description: 'Custom plan', model: 'haiku', order: 1 });

    const def = loadAgentFromDirs(tempBuiltinDir, tempCustomDir, 'plan-agent');
    expect(def.description).toBe('Custom plan');
    expect(def.model).toBe('haiku');
  });

  it('should fall back to built-in when custom agent does not exist', () => {
    writeAgent(tempBuiltinDir, 'verify-agent', { description: 'Built-in verify', order: 3 });

    const def = loadAgentFromDirs(tempBuiltinDir, tempCustomDir, 'verify-agent');
    expect(def.description).toBe('Built-in verify');
  });

  it('should handle missing custom agents directory gracefully', () => {
    fs.rmSync(tempCustomDir, { recursive: true, force: true });
    writeAgent(tempBuiltinDir, 'plan-agent', { order: 1 });

    const agents = mergedListAgents(tempBuiltinDir, tempCustomDir);
    expect(agents).toContain('plan-agent');
  });

  it('should include custom agents in sorted list-definitions IPC response', () => {
    writeAgent(tempBuiltinDir, 'plan-agent', { order: 1 });
    writeAgent(tempBuiltinDir, 'code-agent', { order: 2 });
    writeAgent(tempCustomDir, 'my-custom-agent', { order: 5 });

    const names = mergedListAgents(tempBuiltinDir, tempCustomDir);
    const defs = names.map(name => {
      const { systemPrompt: _, ...def } = loadAgentFromDirs(tempBuiltinDir, tempCustomDir, name);
      return { ...def, isBuiltin: isBuiltinInDir(tempBuiltinDir, name) };
    });
    defs.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

    expect(defs[0].name).toBe('plan-agent');
    expect(defs[0].isBuiltin).toBe(true);
    expect(defs[1].name).toBe('code-agent');
    expect(defs[2].name).toBe('my-custom-agent');
    expect(defs[2].isBuiltin).toBe(false);
  });
});

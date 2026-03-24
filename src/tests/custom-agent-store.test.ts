// src/tests/custom-agent-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  _listCustomAgentsFromDir,
  _loadCustomAgentFromDir,
  _saveCustomAgentToDir,
  _deleteCustomAgentFromDir,
  sanitizeAgentName,
} from '@main/stores/custom-agent-store';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yolium-custom-agents-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('custom-agent-store', () => {
  it('should return empty array when custom agents directory does not exist', () => {
    const nonExistent = path.join(os.tmpdir(), 'yolium-nonexistent-' + Date.now());
    const agents = _listCustomAgentsFromDir(nonExistent);
    expect(agents).toEqual([]);
  });

  it('should list custom agent names from .md files excluding underscore-prefixed files', () => {
    fs.writeFileSync(path.join(tempDir, 'my-agent.md'), '---\nname: my-agent\ndescription: Test\nmodel: sonnet\ntools:\n  - Read\n---\nPrompt');
    fs.writeFileSync(path.join(tempDir, '_private.md'), '---\nname: _private\ndescription: Test\nmodel: sonnet\ntools:\n  - Read\n---\nPrompt');
    fs.writeFileSync(path.join(tempDir, 'other.txt'), 'not an agent');

    const agents = _listCustomAgentsFromDir(tempDir);
    expect(agents).toEqual(['my-agent']);
  });

  it('should load a custom agent definition from the custom agents directory', () => {
    const md = `---
name: test-agent
description: A test agent
model: haiku
tools:
  - Read
  - Grep
timeout: 15
order: 5
---

You are a test agent.`;
    fs.writeFileSync(path.join(tempDir, 'test-agent.md'), md);

    const agent = _loadCustomAgentFromDir(tempDir, 'test-agent');
    expect(agent.name).toBe('test-agent');
    expect(agent.description).toBe('A test agent');
    expect(agent.model).toBe('haiku');
    expect(agent.tools).toEqual(['Read', 'Grep']);
    expect(agent.timeout).toBe(15);
    expect(agent.order).toBe(5);
    expect(agent.systemPrompt).toBe('You are a test agent.');
  });

  it('should save a new custom agent as a markdown file with YAML frontmatter', () => {
    _saveCustomAgentToDir(tempDir, {
      name: 'new-agent',
      description: 'Brand new',
      model: 'opus',
      tools: ['Read', 'Write'],
      timeout: 30,
      order: 10,
      systemPrompt: 'You are a new agent.',
    });

    const filePath = path.join(tempDir, 'new-agent.md');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('name: new-agent');
    expect(content).toContain('description: Brand new');
    expect(content).toContain('model: opus');
    expect(content).toContain('You are a new agent.');
  });

  it('should overwrite an existing custom agent file on save', () => {
    const filePath = path.join(tempDir, 'existing-agent.md');
    fs.writeFileSync(filePath, '---\nname: existing-agent\ndescription: Old\nmodel: sonnet\ntools:\n  - Read\n---\nOld prompt');

    _saveCustomAgentToDir(tempDir, {
      name: 'existing-agent',
      description: 'Updated',
      model: 'opus',
      tools: ['Read', 'Write'],
      systemPrompt: 'New prompt',
    });

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('description: Updated');
    expect(content).toContain('model: opus');
    expect(content).toContain('New prompt');
  });

  it('should delete a custom agent file', () => {
    const filePath = path.join(tempDir, 'doomed-agent.md');
    fs.writeFileSync(filePath, '---\nname: doomed-agent\ndescription: Bye\nmodel: sonnet\ntools:\n  - Read\n---\nPrompt');

    _deleteCustomAgentFromDir(tempDir, 'doomed-agent');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('should throw when deleting a non-existent custom agent', () => {
    expect(() => _deleteCustomAgentFromDir(tempDir, 'nonexistent')).toThrow();
  });

  it('should create the custom agents directory if it does not exist on save', () => {
    const nestedDir = path.join(tempDir, 'nested', 'agents');

    _saveCustomAgentToDir(nestedDir, {
      name: 'auto-dir-agent',
      description: 'Test',
      model: 'sonnet',
      tools: ['Read'],
      systemPrompt: 'Prompt',
    });

    expect(fs.existsSync(nestedDir)).toBe(true);
    expect(fs.existsSync(path.join(nestedDir, 'auto-dir-agent.md'))).toBe(true);
  });

  it('should validate required fields before saving', () => {
    expect(() => _saveCustomAgentToDir(tempDir, {
      name: '',
      description: 'Test',
      model: 'sonnet',
      tools: ['Read'],
      systemPrompt: 'Prompt',
    })).toThrow();

    expect(() => _saveCustomAgentToDir(tempDir, {
      name: 'test',
      description: '',
      model: 'sonnet',
      tools: ['Read'],
      systemPrompt: 'Prompt',
    })).toThrow();
  });

  it('should reject invalid model values', () => {
    expect(() => _saveCustomAgentToDir(tempDir, {
      name: 'bad-model',
      description: 'Test',
      model: 'gpt-4' as 'opus',
      tools: ['Read'],
      systemPrompt: 'Prompt',
    })).toThrow('Invalid model');
  });

  it('should sanitize agent name to filesystem-safe characters', () => {
    expect(sanitizeAgentName('My Agent!')).toBe('my-agent');
    expect(sanitizeAgentName('hello world 123')).toBe('hello-world-123');
    expect(sanitizeAgentName('  spaces  ')).toBe('spaces');
    expect(sanitizeAgentName('UPPERCASE')).toBe('uppercase');
    expect(sanitizeAgentName('dots.and/slashes')).toBe('dotsandslashes');
  });
});

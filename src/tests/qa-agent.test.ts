// src/tests/qa-agent.test.ts
import { describe, it, expect } from 'vitest';
import { parseAgentDefinition } from '@main/services/agent-loader';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('qa-agent', () => {
  const agentPath = path.join(__dirname, '..', 'agents', 'qa-agent.md');

  it('should load qa-agent definition from agents directory', () => {
    expect(fs.existsSync(agentPath)).toBe(true);
  });

  it('should have correct frontmatter fields (name, description, model, order, tools)', () => {
    const markdown = fs.readFileSync(agentPath, 'utf-8');
    const result = parseAgentDefinition(markdown);

    expect(result.name).toBe('qa-agent');
    expect(result.description).toBeTruthy();
    expect(result.model).toBeDefined();
    expect(result.order).toBeDefined();
    expect(result.tools).toBeDefined();
  });

  it('should have model set to opus', () => {
    const markdown = fs.readFileSync(agentPath, 'utf-8');
    const result = parseAgentDefinition(markdown);
    expect(result.model).toBe('opus');
  });

  it('should have order set to 7', () => {
    const markdown = fs.readFileSync(agentPath, 'utf-8');
    const result = parseAgentDefinition(markdown);
    expect(result.order).toBe(7);
  });

  it('should include Bash in tools list (needed for running builds/tests)', () => {
    const markdown = fs.readFileSync(agentPath, 'utf-8');
    const result = parseAgentDefinition(markdown);
    expect(result.tools).toContain('Bash');
  });

  it('should have a non-empty system prompt', () => {
    const markdown = fs.readFileSync(agentPath, 'utf-8');
    const result = parseAgentDefinition(markdown);
    expect(result.systemPrompt.length).toBeGreaterThan(0);
    expect(result.systemPrompt).toContain('# QA Agent');
  });
});

// src/tests/code-agent.test.ts
import { describe, it, expect } from 'vitest';
import { parseAgentDefinition } from '@main/services/agent-loader';
import * as fs from 'node:fs';
import * as path from 'node:path';

const agentPath = path.join(__dirname, '..', 'agents', 'code-agent.md');
const agentMarkdown = fs.readFileSync(agentPath, 'utf-8');

describe('code-agent', () => {
  it('should parse successfully via parseAgentDefinition', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent).toBeDefined();
    expect(agent.name).toBe('code-agent');
  });

  it('should have correct metadata', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.name).toBe('code-agent');
    expect(agent.description).toBe('Autonomously implements code changes, writes tests, and commits locally');
    expect(agent.model).toBe('opus');
    expect(agent.timeout).toBe(60);
  });

  it('should have expected implementation tools', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.tools).toContain('Read');
    expect(agent.tools).toContain('Glob');
    expect(agent.tools).toContain('Grep');
    expect(agent.tools).toContain('Bash');
    expect(agent.tools).toContain('Write');
    expect(agent.tools).toContain('Edit');
  });

  it('should include Agent tool for sub-agent parallelism', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.tools).toContain('Agent');
  });

  it('should require in-scope dead-code removal and simplification', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('Remove dead code and unnecessary complexity encountered in the touched scope');
    expect(agent.systemPrompt).toContain('Keep simplifications behavior-preserving and in scope');
    expect(agent.systemPrompt).toContain('If dead code in touched scope is intentionally retained, explain why');
    expect(agent.systemPrompt).toContain('including cleanup that is directly in the touched scope');
    expect(agent.systemPrompt).toContain('Prefer behavior-preserving simplifications and dead-code removal over adding complexity');
  });

  it('should include required local test and protocol expectations', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('npm test');
    expect(agent.systemPrompt).toContain('@@YOLIUM:');
    expect(agent.systemPrompt).toContain('progress');
    expect(agent.systemPrompt).toContain('comment');
    expect(agent.systemPrompt).toContain('complete');
  });

  it('should include TDD workflow with write-tests-first step', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('Write Tests First (TDD)');
    expect(agent.systemPrompt).toContain('test specifications');
    expect(agent.systemPrompt).toContain('before writing any production code');
    expect(agent.systemPrompt).toContain('write-tests');
  });

  it('should reference 8 steps in the process', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('8 steps');
    expect(agent.systemPrompt).toContain('Step 8: Signal Completion');
  });

  it('should include TDD rule', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('Tests first (TDD)');
    expect(agent.systemPrompt).toContain('implement them before writing production code');
  });
});

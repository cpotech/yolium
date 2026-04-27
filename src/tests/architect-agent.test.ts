// src/tests/architect-agent.test.ts
import { describe, it, expect } from 'vitest';
import { parseAgentDefinition } from '@main/services/agent-loader';
import * as fs from 'node:fs';
import * as path from 'node:path';

const agentPath = path.join(__dirname, '..', 'agents', 'architect-agent.md');
const agentMarkdown = fs.readFileSync(agentPath, 'utf-8');

describe('architect-agent', () => {
  it('should load architect-agent definition from agents directory', () => {
    expect(fs.existsSync(agentPath)).toBe(true);
  });

  it('should parse successfully via parseAgentDefinition', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent).toBeDefined();
    expect(agent.name).toBe('architect-agent');
  });

  it('should have correct frontmatter metadata (description, model, order=0)', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.description).toBeTruthy();
    expect(agent.model).toBe('opus');
    expect(agent.order).toBe(0);
  });

  it('should be read-only: tools must not include Write or Edit', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.tools).not.toContain('Write');
    expect(agent.tools).not.toContain('Edit');
  });

  it('should include read-only research tools (Read, Glob, Grep, Bash, WebSearch, WebFetch)', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.tools).toContain('Read');
    expect(agent.tools).toContain('Glob');
    expect(agent.tools).toContain('Grep');
    expect(agent.tools).toContain('Bash');
    expect(agent.tools).toContain('WebSearch');
    expect(agent.tools).toContain('WebFetch');
  });

  it('should have a Step 0: Report Model section before the first numbered phase/step', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('Step 0: Report Model');
    const step0Index = agent.systemPrompt.search(/###\s+Step\s+0\b/);
    const firstStepIndex = agent.systemPrompt.search(/###\s+Step\s+1\b|###\s+Phase\s+1\b/);
    expect(step0Index).toBeGreaterThan(-1);
    expect(firstStepIndex).toBeGreaterThan(-1);
    expect(step0Index).toBeLessThan(firstStepIndex);
  });

  it('should reference create_item in protocol (the agent emits one per slice)', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('create_item');
  });

  it('should instruct decomposing into vertical slices, not layered/horizontal items', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt.toLowerCase()).toContain('vertical slice');
  });

  it('should instruct that order reflects strict dependency between items', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toMatch(/order|dependency/i);
    expect(agent.systemPrompt).toContain('dependency');
  });

  it('should default agentProvider to claude when emitting create_item', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('claude');
    expect(agent.systemPrompt).toMatch(/agentProvider/);
  });

  it('should be read-only and not write/modify project files', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt.toLowerCase()).toMatch(/read-only|do not (modify|create|write)/);
  });
});

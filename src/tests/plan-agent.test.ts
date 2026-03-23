// src/tests/plan-agent.test.ts
import { describe, it, expect } from 'vitest';
import { parseAgentDefinition } from '@main/services/agent-loader';
import * as fs from 'node:fs';
import * as path from 'node:path';

const agentPath = path.join(__dirname, '..', 'agents', 'plan-agent.md');
const agentMarkdown = fs.readFileSync(agentPath, 'utf-8');

describe('plan-agent', () => {
  it('should parse successfully via parseAgentDefinition', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent).toBeDefined();
    expect(agent.name).toBe('plan-agent');
  });

  it('should have correct metadata', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.name).toBe('plan-agent');
    expect(agent.description).toBe('Analyzes codebase and produces an implementation plan for a work item');
    expect(agent.model).toBe('opus');
  });

  it('should have expected planning tools', () => {
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

  it('should require simplification and dead-code analysis in planning', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('in-scope simplification/dead-code opportunities');
    expect(agent.systemPrompt).toContain('Identify behavior-preserving simplification opportunities and dead code candidates');
    expect(agent.systemPrompt).toContain('including cleanup/simplification and dead-code removal work when applicable');
    expect(agent.systemPrompt).toContain('test requirements and simplification/dead-code expectations where applicable');
    expect(agent.systemPrompt).toContain('Prefer simpler designs');
    expect(agent.systemPrompt).toContain('Constrain cleanup to scope');
  });

  it('should include the @@YOLIUM protocol reference', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('@@YOLIUM:');
    expect(agent.systemPrompt).toContain('progress');
    expect(agent.systemPrompt).toContain('add_comment');
    expect(agent.systemPrompt).toContain('update_description');
    expect(agent.systemPrompt).toContain('complete');
  });

  it('should include set_test_specs in protocol reference', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('set_test_specs');
  });

  it('should include test specification step in planning flow', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('Write Test Specifications');
    expect(agent.systemPrompt).toContain('test-driven development');
    expect(agent.systemPrompt).toContain('"type":"set_test_specs"');
  });

  it('should reference 5 steps in the planning flow', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('ALL 5 steps');
    expect(agent.systemPrompt).toContain('Step 5: Deliver');
  });
});

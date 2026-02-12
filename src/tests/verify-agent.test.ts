// src/tests/verify-agent.test.ts
import { describe, it, expect } from 'vitest';
import { parseAgentDefinition } from '@main/services/agent-loader';
import * as fs from 'node:fs';
import * as path from 'node:path';

const agentPath = path.join(__dirname, '..', 'agents', 'verify-agent.md');
const agentMarkdown = fs.readFileSync(agentPath, 'utf-8');

describe('verify-agent', () => {
  it('should parse successfully via parseAgentDefinition', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent).toBeDefined();
    expect(agent.name).toBe('verify-agent');
  });

  it('should have correct metadata', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.name).toBe('verify-agent');
    expect(agent.description).toBe('Reviews code changes for correctness, over-engineering, and project guideline compliance');
    expect(agent.model).toBe('opus');
    expect(agent.timeout).toBe(30);
  });

  it('should have read-only tools (no Write or Edit)', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.tools).toContain('Read');
    expect(agent.tools).toContain('Glob');
    expect(agent.tools).toContain('Grep');
    expect(agent.tools).toContain('Bash');
    expect(agent.tools).not.toContain('Write');
    expect(agent.tools).not.toContain('Edit');
    expect(agent.tools).toHaveLength(4);
  });

  it('should have a system prompt with key verification sections', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('Verify Agent');
    expect(agent.systemPrompt).toContain('Verification Report');
    expect(agent.systemPrompt).toContain('APPROVED');
    expect(agent.systemPrompt).toContain('REJECTED');
    expect(agent.systemPrompt).toContain('NEEDS REVISION');
  });

  it('should include the @@YOLIUM protocol reference', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('@@YOLIUM:');
    expect(agent.systemPrompt).toContain('progress');
    expect(agent.systemPrompt).toContain('comment');
    expect(agent.systemPrompt).toContain('complete');
    expect(agent.systemPrompt).toContain('error');
  });

  it('should reference git diff and npm test commands', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('git diff main...HEAD');
    expect(agent.systemPrompt).toContain('npm test');
  });

  it('should reference CLAUDE.md for guideline checking', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('CLAUDE.md');
  });

  it('should have clear section headers for file-based reading', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('## Protocol Format Reference');
    expect(agent.systemPrompt).toContain('## Your Process');
    expect(agent.systemPrompt).toContain('## Report Format');
    expect(agent.systemPrompt).toContain('## Verdict Criteria');
    expect(agent.systemPrompt).toContain('## Rules');
  });

  it('should require explicit simplification/dead-code evidence in review output', () => {
    const agent = parseAgentDefinition(agentMarkdown);
    expect(agent.systemPrompt).toContain('Explicitly validate whether changed files were reasonably simplified');
    expect(agent.systemPrompt).toContain('Cleanup execution quality');
    expect(agent.systemPrompt).toContain('In-scope simplification/dead-code expectations verified');
    expect(agent.systemPrompt).toContain('Dead code status');
    expect(agent.systemPrompt).toContain('Simplification evidence');
    expect(agent.systemPrompt).toContain('no avoidable in-scope dead code/complexity remains');
    expect(agent.systemPrompt).toContain('Show cleanup evidence');
  });
});

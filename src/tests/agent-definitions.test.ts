// src/tests/agent-definitions.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const agentsDir = path.join(__dirname, '..', 'agents');
const claudeMdPath = path.join(__dirname, '..', '..', 'CLAUDE.md');

const codeAgent = fs.readFileSync(path.join(agentsDir, 'code-agent.md'), 'utf-8');
const verifyAgent = fs.readFileSync(path.join(agentsDir, 'verify-agent.md'), 'utf-8');
const qaAgent = fs.readFileSync(path.join(agentsDir, 'qa-agent.md'), 'utf-8');
const planAgent = fs.readFileSync(path.join(agentsDir, 'plan-agent.md'), 'utf-8');
const claudeMd = fs.readFileSync(claudeMdPath, 'utf-8');

describe('agent definitions - no replicated production code in tests', () => {
  it('code-agent.md should contain a rule prohibiting replicated production code in tests', () => {
    expect(codeAgent).toContain('No replicated production code in tests');
  });

  it('code-agent.md Step 3 should instruct agents to import real modules, not copy code', () => {
    expect(codeAgent).toContain('NEVER copy or re-implement production code in test files');
  });

  it('verify-agent.md should check for replicated production code in test files', () => {
    expect(verifyAgent).toContain('replicated production code');
  });

  it('qa-agent.md should scan for duplicated production logic in tests', () => {
    expect(qaAgent).toContain('Replicated production code in tests');
  });

  it('plan-agent.md should require test specs to import real production modules', () => {
    expect(planAgent).toContain('importing real production modules');
  });

  it('CLAUDE.md Agent Testing Requirements should prohibit replicated production code in tests', () => {
    expect(claudeMd).toContain('Never Replicate Production Code in Tests');
  });
});

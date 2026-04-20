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
const protocolMd = fs.readFileSync(path.join(agentsDir, '_protocol.md'), 'utf-8');
const claudeMd = fs.readFileSync(claudeMdPath, 'utf-8');

function discoverAgentMarkdownFiles(): string[] {
  return fs
    .readdirSync(agentsDir)
    .filter((name) => name.endsWith('-agent.md'))
    .filter((name) => name !== '_protocol.md' && name !== 'README.md')
    .sort();
}

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

describe('agent definitions - model self-reporting', () => {
  const agentFiles = discoverAgentMarkdownFiles();

  it('should discover all *-agent.md files in src/agents/ excluding _protocol.md and README.md', () => {
    expect(agentFiles).toEqual(
      expect.arrayContaining([
        'ba-agent.md',
        'code-agent.md',
        'design-agent.md',
        'kb-agent.md',
        'marketing-agent.md',
        'plan-agent.md',
        'qa-agent.md',
        'scout-agent.md',
        'verify-agent.md',
      ]),
    );
    expect(agentFiles).not.toContain('_protocol.md');
    expect(agentFiles).not.toContain('README.md');
    expect(agentFiles.length).toBeGreaterThanOrEqual(9);
  });

  for (const fileName of agentFiles) {
    describe(fileName, () => {
      const content = fs.readFileSync(path.join(agentsDir, fileName), 'utf-8');

      it('should contain a step named "model" with a progress message template', () => {
        expect(content).toMatch(/"step"\s*:\s*"model"/);
      });

      it('should instruct emitting @@YOLIUM progress with step="model" before any other numbered step', () => {
        expect(content).toMatch(
          /@@YOLIUM:\{"type":"progress","step":"model","detail":"[^"]+"\}/,
        );
        // The model step must appear before the first non-Step-0 numbered step (Step 1 / Phase 1).
        const modelIndex = content.search(/"step"\s*:\s*"model"/);
        const firstStepIndex = content.search(/###\s+Step\s+1\b|###\s+Phase\s+1\b/);
        expect(modelIndex).toBeGreaterThan(-1);
        expect(firstStepIndex).toBeGreaterThan(-1);
        expect(modelIndex).toBeLessThan(firstStepIndex);
      });

      it('should have a Step 0: Report Model section before the first numbered step', () => {
        const step0Index = content.search(/###\s+Step\s+0\b/);
        const firstStepIndex = content.search(/###\s+Step\s+1\b|###\s+Phase\s+1\b/);
        expect(step0Index).toBeGreaterThan(-1);
        expect(firstStepIndex).toBeGreaterThan(-1);
        expect(step0Index).toBeLessThan(firstStepIndex);
      });
    });
  }

  it('_protocol.md should document the model progress step convention under a "Model Reporting" section', () => {
    expect(protocolMd).toMatch(/##\s+Model Reporting/);
    expect(protocolMd).toMatch(/"step"\s*:\s*"model"/);
    expect(protocolMd).toContain('<provider>/<model-id>');
  });
});

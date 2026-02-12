// src/tests/marketing-agent.test.ts
import { describe, it, expect } from 'vitest';
import { parseAgentDefinition } from '@main/services/agent-loader';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('marketing-agent', () => {
  const agentMarkdown = fs.readFileSync(
    path.join(__dirname, '..', 'agents', 'marketing-agent.md'),
    'utf-8'
  );

  describe('parseAgentDefinition', () => {
    it('should parse marketing-agent frontmatter correctly', () => {
      const result = parseAgentDefinition(agentMarkdown);

      expect(result.name).toBe('marketing-agent');
      expect(result.description).toContain('marketing');
      expect(result.model).toBe('opus');
      expect(result.timeout).toBe(60);
      expect(result.tools).toEqual([
        'Read', 'Glob', 'Grep', 'Bash', 'Write', 'Edit', 'WebSearch', 'WebFetch',
      ]);
    });

    it('should have a non-empty system prompt', () => {
      const result = parseAgentDefinition(agentMarkdown);
      expect(result.systemPrompt.length).toBeGreaterThan(0);
      expect(result.systemPrompt).toContain('# Marketing Agent');
    });

    it('should include skill index in system prompt', () => {
      const result = parseAgentDefinition(agentMarkdown);
      expect(result.systemPrompt).toContain('## Skill Index');
      expect(result.systemPrompt).toContain('page-cro');
      expect(result.systemPrompt).toContain('copywriting');
      expect(result.systemPrompt).toContain('seo-audit');
      expect(result.systemPrompt).toContain('paid-ads');
      expect(result.systemPrompt).toContain('product-marketing-context');
    });

    it('should include all 25 skills in the skill index', () => {
      const result = parseAgentDefinition(agentMarkdown);
      const expectedSkills = [
        'page-cro', 'signup-flow-cro', 'onboarding-cro', 'form-cro',
        'popup-cro', 'paywall-upgrade-cro', 'copywriting', 'copy-editing',
        'email-sequence', 'social-content', 'seo-audit', 'programmatic-seo',
        'schema-markup', 'paid-ads', 'ab-test-setup', 'analytics-tracking',
        'free-tool-strategy', 'referral-program', 'content-strategy',
        'marketing-ideas', 'launch-strategy', 'pricing-strategy',
        'marketing-psychology', 'competitor-alternatives', 'product-marketing-context',
      ];

      for (const skill of expectedSkills) {
        expect(result.systemPrompt).toContain(skill);
      }
    });

    it('should reference @@YOLIUM protocol', () => {
      const result = parseAgentDefinition(agentMarkdown);
      expect(result.systemPrompt).toContain('@@YOLIUM:');
      expect(result.systemPrompt).toContain('progress');
      expect(result.systemPrompt).toContain('complete');
      expect(result.systemPrompt).toContain('error');
    });

    it('should reference /opt/marketing-skills/ path for container access', () => {
      const result = parseAgentDefinition(agentMarkdown);
      expect(result.systemPrompt).toContain('/opt/marketing-skills/');
    });

    it('should include product marketing context check', () => {
      const result = parseAgentDefinition(agentMarkdown);
      expect(result.systemPrompt).toContain('product-marketing-context');
      expect(result.systemPrompt).toContain('Check Product Marketing Context');
    });
  });

  describe('agent discovery', () => {
    it('should have marketing-agent.md in the agents directory', () => {
      const agentPath = path.join(__dirname, '..', 'agents', 'marketing-agent.md');
      expect(fs.existsSync(agentPath)).toBe(true);
    });

    it('should not start with _ (excluded from listAgents)', () => {
      expect('marketing-agent.md'.startsWith('_')).toBe(false);
    });
  });

  describe('marketing-skills bundled files', () => {
    const skillsDir = path.join(__dirname, '..', 'docker', 'marketing-skills');

    it('should have 25 skill directories', () => {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory());
      expect(dirs.length).toBe(25);
    });

    it('should have a SKILL.md in each skill directory', () => {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory());

      for (const dir of dirs) {
        const skillFile = path.join(skillsDir, dir.name, 'SKILL.md');
        expect(fs.existsSync(skillFile), `Missing SKILL.md in ${dir.name}`).toBe(true);
      }
    });
  });
});

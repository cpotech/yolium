// src/tests/design-agent.test.ts
import { describe, it, expect } from 'vitest';
import { parseAgentDefinition } from '@main/services/agent-loader';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('design-agent', () => {
  const agentMarkdown = fs.readFileSync(
    path.join(__dirname, '..', 'agents', 'design-agent.md'),
    'utf-8'
  );

  describe('parseAgentDefinition', () => {
    it('should parse design-agent frontmatter correctly', () => {
      const result = parseAgentDefinition(agentMarkdown);

      expect(result.name).toBe('design-agent');
      expect(result.model).toBe('opus');
      expect(result.timeout).toBe(60);
      expect(result.order).toBe(5);
      expect(result.tools).toEqual([
        'Read', 'Glob', 'Grep', 'Bash', 'Write', 'Edit',
      ]);
    });

    it('should have a non-empty system prompt', () => {
      const result = parseAgentDefinition(agentMarkdown);
      expect(result.systemPrompt.length).toBeGreaterThan(0);
      expect(result.systemPrompt).toContain('# Design Agent');
    });

    it('should include skill index in system prompt', () => {
      const result = parseAgentDefinition(agentMarkdown);
      expect(result.systemPrompt).toContain('frontend-design');
      expect(result.systemPrompt).toContain('audit');
      expect(result.systemPrompt).toContain('critique');
      expect(result.systemPrompt).toContain('polish');
      expect(result.systemPrompt).toContain('colorize');
      expect(result.systemPrompt).toContain('animate');
    });

    it('should include all 18 skills in the skill index', () => {
      const result = parseAgentDefinition(agentMarkdown);
      const expectedSkills = [
        'adapt', 'animate', 'audit', 'bolder', 'clarify', 'colorize',
        'critique', 'delight', 'distill', 'extract', 'frontend-design',
        'harden', 'normalize', 'onboard', 'optimize', 'polish',
        'quieter', 'teach-impeccable',
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

    it('should reference /opt/design-skills/ path for container access', () => {
      const result = parseAgentDefinition(agentMarkdown);
      expect(result.systemPrompt).toContain('/opt/design-skills/');
    });
  });

  describe('agent discovery', () => {
    it('should have design-agent.md in the agents directory', () => {
      const agentPath = path.join(__dirname, '..', 'agents', 'design-agent.md');
      expect(fs.existsSync(agentPath)).toBe(true);
    });

    it('should not start with _ (excluded from listAgents)', () => {
      expect('design-agent.md'.startsWith('_')).toBe(false);
    });
  });

  describe('design-skills bundled files', () => {
    const skillsDir = path.join(__dirname, '..', 'docker', 'design-skills');

    it('should have 18 skill directories', () => {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory());
      expect(dirs.length).toBe(18);
    });

    it('should have a SKILL.md in each skill directory', () => {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory());

      for (const dir of dirs) {
        const skillFile = path.join(skillsDir, dir.name, 'SKILL.md');
        expect(fs.existsSync(skillFile), `Missing SKILL.md in ${dir.name}`).toBe(true);
      }
    });

    it('should have 7 reference files in frontend-design', () => {
      const refDir = path.join(skillsDir, 'frontend-design', 'reference');
      expect(fs.existsSync(refDir), 'reference/ directory should exist').toBe(true);

      const files = fs.readdirSync(refDir).filter(f => f.endsWith('.md'));
      expect(files.length).toBe(7);
    });
  });
});

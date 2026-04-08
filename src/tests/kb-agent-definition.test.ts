import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const matter = require('gray-matter');

const agentPath = resolve(__dirname, '..', 'agents', 'kb-agent.md');

describe('kb-agent definition', () => {
  it('should have valid YAML frontmatter with required fields', () => {
    const raw = readFileSync(agentPath, 'utf-8');
    const { data } = matter(raw);
    expect(data.name).toBe('kb-agent');
    expect(data.description).toBeTruthy();
    expect(data.model).toBe('sonnet');
    expect(data.order).toBe(9);
    expect(data.tools).toEqual(expect.arrayContaining(['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']));
  });

  it('should include system prompt with KB-specific instructions', () => {
    const raw = readFileSync(agentPath, 'utf-8');
    const { content } = matter(raw);
    expect(content).toContain('.yolium/kb/');
    expect(content).toContain('_index.md');
    expect(content).toMatch(/categor/i);
    expect(content).toMatch(/\[\[.*\]\]/); // wikilinks reference
  });

  it('should include Protocol Format Reference section with message type table', () => {
    const raw = readFileSync(agentPath, 'utf-8');
    const { content } = matter(raw);
    expect(content).toContain('## Protocol Format Reference');
    expect(content).toContain('| Message Type |');
    expect(content).toContain('| progress |');
    expect(content).toContain('| complete |');
    expect(content).toContain('| error |');
  });

  it('should include CRITICAL warning about protocol messages', () => {
    const raw = readFileSync(agentPath, 'utf-8');
    const { content } = matter(raw);
    expect(content).toMatch(/\*\*CRITICAL:.*protocol messages/i);
    expect(content).toContain('marked as FAILED');
  });

  it('should include mandatory @@YOLIUM: emissions in each process step', () => {
    const raw = readFileSync(agentPath, 'utf-8');
    const { content } = matter(raw);
    // Must contain protocol message examples for key types
    expect(content).toContain('@@YOLIUM:{"type":"progress"');
    expect(content).toContain('@@YOLIUM:{"type":"complete"');
    // Must have emissions for key steps
    expect(content).toContain('"step":"analyze"');
    expect(content).toContain('"step":"scan"');
    expect(content).toContain('"step":"extract"');
    expect(content).toContain('"step":"write"');
    expect(content).toContain('"step":"index"');
    expect(content).toContain('"step":"commit"');
  });

  it('should include a commit step for .yolium/kb/ changes', () => {
    const raw = readFileSync(agentPath, 'utf-8');
    const { content } = matter(raw);
    expect(content).toContain('docs(kb):');
    expect(content).toMatch(/commit/i);
    expect(content).toContain('.yolium/kb/');
  });

  it('should not reference .yolium-kb-summary.md', () => {
    const raw = readFileSync(agentPath, 'utf-8');
    const { content } = matter(raw);
    expect(content).not.toContain('.yolium-kb-summary.md');
  });

  it('should include rules about staying on branch, committing, and not pushing', () => {
    const raw = readFileSync(agentPath, 'utf-8');
    const { content } = matter(raw);
    expect(content).toMatch(/stay.*on.*branch|current.*branch.*never.*create/i);
    expect(content).toMatch(/do not push|never push|no.*push/i);
    expect(content).toMatch(/conventional commit|docs\(kb\)/i);
  });
});

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
});

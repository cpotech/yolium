import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSpecialistsDirMock } = vi.hoisted(() => ({
  getSpecialistsDirMock: vi.fn(),
}));

vi.mock('@main/services/specialist-loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@main/services/specialist-loader')>();
  return {
    ...actual,
    getSpecialistsDir: getSpecialistsDirMock,
  };
});

import { scaffoldSpecialist } from '@main/services/specialist-scaffold';

describe('specialist-scaffold', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'specialist-scaffold-'));
    const cronDir = path.join(tempRoot, 'cron');
    getSpecialistsDirMock.mockReturnValue(cronDir);
  });

  afterEach(() => {
    vi.clearAllMocks();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should create a specialist file with kebab-case name', () => {
    const filePath = scaffoldSpecialist('code-quality');

    expect(filePath).toBe(path.join(path.join(tempRoot, 'cron'), 'code-quality.md'));
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('name: code-quality');
    expect(content).toContain('# Code Quality Specialist');
  });

  it('should throw when specialist with same name already exists', () => {
    scaffoldSpecialist('security-monitor');

    expect(() => scaffoldSpecialist('security-monitor')).toThrow(/already exists/);
  });

  it('should use provided description in the template', () => {
    const filePath = scaffoldSpecialist('cost-audit', {
      description: 'Audit infrastructure spend and waste',
    });

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('description: Audit infrastructure spend and waste');
    expect(content).toContain('You are a specialist agent for Audit infrastructure spend and waste.');
  });

  it('should generate default description when none provided', () => {
    const filePath = scaffoldSpecialist('security-monitor');

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('description: security-monitor monitoring and analysis');
  });

  it('should create the cron directory if it does not exist', () => {
    const nestedCronDir = path.join(tempRoot, 'nested', 'agents', 'cron');
    getSpecialistsDirMock.mockReturnValue(nestedCronDir);

    const filePath = scaffoldSpecialist('weekly-review');

    expect(fs.existsSync(nestedCronDir)).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('should write raw markdown content when provided instead of using template', () => {
    const rawContent = `---
name: custom-specialist
description: Custom specialist from raw markdown
model: sonnet
tools:
  - Read
  - Bash
schedules:
  - type: daily
    cron: "0 8 * * *"
    enabled: true
memory:
  strategy: raw
  maxEntries: 100
  retentionDays: 30
escalation:
  onFailure: alert_user
---

# Custom Specialist

You are a custom specialist.`;

    const filePath = scaffoldSpecialist('custom-specialist', { content: rawContent });

    expect(fs.existsSync(filePath)).toBe(true);
    const written = fs.readFileSync(filePath, 'utf-8');
    expect(written).toContain('# Custom Specialist');
    expect(written).toContain('You are a custom specialist.');
  });

  it('should validate raw markdown through parseSpecialistDefinition before writing', () => {
    const invalidContent = `---
name: bad
---

No required fields`;

    expect(() => scaffoldSpecialist('bad-specialist', { content: invalidContent })).toThrow();
  });

  it('should override frontmatter name with provided name in raw content', () => {
    const rawContent = `---
name: original-name
description: A specialist
model: haiku
tools:
  - Read
schedules:
  - type: daily
    cron: "0 0 * * *"
    enabled: true
memory:
  strategy: raw
  maxEntries: 100
  retentionDays: 30
escalation:
  onFailure: alert_user
---

# Specialist`;

    const filePath = scaffoldSpecialist('overridden-name', { content: rawContent });

    const written = fs.readFileSync(filePath, 'utf-8');
    expect(written).toContain('name: overridden-name');
    expect(written).not.toContain('name: original-name');
  });

  it('should reject invalid raw markdown with descriptive error', () => {
    const invalidContent = 'not even valid frontmatter';

    expect(() => scaffoldSpecialist('bad-specialist', { content: invalidContent })).toThrow();
  });

  it('should use default template when no content is provided', () => {
    const filePath = scaffoldSpecialist('default-template');

    const written = fs.readFileSync(filePath, 'utf-8');
    expect(written).toContain('name: default-template');
    expect(written).toContain('# Default Template Specialist');
    expect(written).toContain('model: haiku');
  });
});

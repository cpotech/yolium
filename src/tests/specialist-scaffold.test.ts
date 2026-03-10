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

import {
  scaffoldSpecialist,
  getDefaultTemplate,
  updateSpecialistDefinition,
} from '@main/services/specialist-scaffold';

describe('getDefaultTemplate', () => {
  it('should return template with name and description substituted', () => {
    const result = getDefaultTemplate('code-quality', 'Code quality monitoring');
    expect(result).toContain('name: code-quality');
    expect(result).toContain('description: Code quality monitoring');
    expect(result).toContain('# Code Quality Specialist');
    expect(result).toContain('You are a specialist agent for Code quality monitoring.');
  });

  it('should use default description when none provided', () => {
    const result = getDefaultTemplate('security-monitor');
    expect(result).toContain('description: security-monitor monitoring and analysis');
    expect(result).toContain('You are a specialist agent for security-monitor monitoring and analysis.');
  });

  it('should return template containing valid YAML frontmatter', () => {
    const result = getDefaultTemplate('test-agent', 'Test description');
    expect(result).toMatch(/^---\n/);
    expect(result).toContain('name: test-agent');
    expect(result).toContain('model: haiku');
    expect(result).toContain('tools:');
    expect(result).toContain('schedules:');
  });

  it('should normalize template output to LF line endings', () => {
    const result = getDefaultTemplate('line-ending-agent', 'Line ending coverage');

    expect(result).not.toContain('\r\n');
  });
});

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

  it('should overwrite an existing specialist file when saving edited markdown for the same specialist id', () => {
    const filePath = scaffoldSpecialist('twitter-growth', {
      content: `---
name: twitter-growth
description: Original description
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

# Original Specialist`,
    });

    const updatedFilePath = updateSpecialistDefinition('twitter-growth', `---
name: renamed-in-markdown
description: Updated description
model: sonnet
tools:
  - Read
  - Bash
schedules:
  - type: weekly
    cron: "0 2 * * 0"
    enabled: true
memory:
  strategy: raw
  maxEntries: 200
  retentionDays: 45
escalation:
  onFailure: reduce_frequency
---

# Updated Specialist`);

    expect(updatedFilePath).toBe(filePath);
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('description: Updated description');
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('# Updated Specialist');
    expect(fs.readFileSync(filePath, 'utf-8')).not.toContain('Original description');
  });

  it('should keep the saved frontmatter name aligned with the original specialist id during edits', () => {
    const filePath = scaffoldSpecialist('security-monitor', {
      content: `---
name: security-monitor
description: Security scanning
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

# Security Monitor`,
    });

    updateSpecialistDefinition('security-monitor', `---
name: accidental-rename
description: Updated security scanning
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

# Security Monitor`);

    const written = fs.readFileSync(filePath, 'utf-8');
    expect(written).toContain('name: security-monitor');
    expect(written).not.toContain('name: accidental-rename');
  });

  it('should throw a descriptive error when updating a specialist that does not exist', () => {
    expect(() =>
      updateSpecialistDefinition('missing-specialist', `---
name: missing-specialist
description: Missing specialist
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

# Missing Specialist`)
    ).toThrow(/does not exist/i);
  });
});

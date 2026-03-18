import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSpecialistsDirMock, getCustomSpecialistsDirMock, resolveSpecialistPathMock } = vi.hoisted(() => ({
  getSpecialistsDirMock: vi.fn(),
  getCustomSpecialistsDirMock: vi.fn(),
  resolveSpecialistPathMock: vi.fn(),
}));

vi.mock('@main/services/specialist-loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@main/services/specialist-loader')>();
  return {
    ...actual,
    getSpecialistsDir: getSpecialistsDirMock,
    getCustomSpecialistsDir: getCustomSpecialistsDirMock,
    resolveSpecialistPath: resolveSpecialistPathMock,
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
    const customDir = path.join(tempRoot, 'custom');
    getSpecialistsDirMock.mockReturnValue(cronDir);
    getCustomSpecialistsDirMock.mockReturnValue(customDir);
    // Default: resolveSpecialistPath returns null (specialist not found in either dir)
    resolveSpecialistPathMock.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should create a specialist file with kebab-case name', () => {
    const filePath = scaffoldSpecialist('code-quality');

    expect(filePath).toBe(path.join(path.join(tempRoot, 'custom'), 'code-quality.md'));
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

  it('should create the custom directory if it does not exist', () => {
    const nestedCustomDir = path.join(tempRoot, 'nested', 'agents', 'cron', 'custom');
    getCustomSpecialistsDirMock.mockReturnValue(nestedCustomDir);

    const filePath = scaffoldSpecialist('weekly-review');

    expect(fs.existsSync(nestedCustomDir)).toBe(true);
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

    // Mock resolveSpecialistPath to find it where it was scaffolded
    resolveSpecialistPathMock.mockReturnValue({ filePath, source: 'custom' });

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

    resolveSpecialistPathMock.mockReturnValue({ filePath, source: 'custom' });

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

  it('should scaffold new specialists to the custom directory', () => {
    const customDir = getCustomSpecialistsDirMock();
    const filePath = scaffoldSpecialist('new-custom-agent');

    expect(filePath).toBe(path.join(customDir, 'new-custom-agent.md'));
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('name: new-custom-agent');
  });

  it('should create custom directory if it does not exist', () => {
    const customDir = path.join(tempRoot, 'deeply', 'nested', 'custom');
    getCustomSpecialistsDirMock.mockReturnValue(customDir);

    const filePath = scaffoldSpecialist('nested-agent');

    expect(fs.existsSync(customDir)).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('should update specialist in default dir when specialist lives in default dir', () => {
    const defaultDir = getSpecialistsDirMock();
    // Create directory and a specialist in the default dir manually
    fs.mkdirSync(defaultDir, { recursive: true });
    const defaultPath = path.join(defaultDir, 'default-agent.md');
    const content = `---
name: default-agent
description: A default agent
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

# Default Agent`;
    fs.writeFileSync(defaultPath, content, 'utf-8');

    // Mock resolveSpecialistPath to find it in default dir
    resolveSpecialistPathMock.mockReturnValue({ filePath: defaultPath, source: 'default' });

    const updatedPath = updateSpecialistDefinition('default-agent', `---
name: default-agent
description: Updated default agent
model: sonnet
tools:
  - Read
  - Bash
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

# Updated Default Agent`);

    expect(updatedPath).toBe(defaultPath);
    const written = fs.readFileSync(updatedPath, 'utf-8');
    expect(written).toContain('description: Updated default agent');
  });

  it('should update specialist in custom dir when specialist lives in custom dir', () => {
    const customDir = getCustomSpecialistsDirMock();
    // Create directory and a specialist in the custom dir manually
    fs.mkdirSync(customDir, { recursive: true });
    const customPath = path.join(customDir, 'custom-agent.md');
    const content = `---
name: custom-agent
description: A custom agent
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

# Custom Agent`;
    fs.writeFileSync(customPath, content, 'utf-8');

    // Mock resolveSpecialistPath to find it in custom dir
    resolveSpecialistPathMock.mockReturnValue({ filePath: customPath, source: 'custom' });

    const updatedPath = updateSpecialistDefinition('custom-agent', `---
name: custom-agent
description: Updated custom agent
model: sonnet
tools:
  - Read
  - Bash
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

# Updated Custom Agent`);

    expect(updatedPath).toBe(customPath);
    const written = fs.readFileSync(updatedPath, 'utf-8');
    expect(written).toContain('description: Updated custom agent');
  });

  it('should reject creating a custom specialist when the name already exists in the default dir', () => {
    const defaultPath = path.join(tempRoot, 'cron', 'security-monitor.md');
    resolveSpecialistPathMock.mockReturnValue({ filePath: defaultPath, source: 'default' });

    expect(() => scaffoldSpecialist('security-monitor')).toThrow(`already exists at ${defaultPath}`);
  });
});

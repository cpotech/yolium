/**
 * @module src/main/services/specialist-scaffold
 * Generate new specialist definition files from a template.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import { getSpecialistsDir, parseSpecialistDefinition } from './specialist-loader';

const TEMPLATE = `---
name: {{name}}
description: {{description}}
model: haiku
tools:
  - Read
  - Glob
  - Grep
  - Bash
schedules:
  - type: heartbeat
    cron: "*/30 * * * *"
    enabled: false
  - type: daily
    cron: "0 0 * * *"
    enabled: true
  - type: weekly
    cron: "0 2 * * 0"
    enabled: true
memory:
  strategy: distill_daily
  maxEntries: 300
  retentionDays: 90
escalation:
  onFailure: alert_user
  onPattern: reduce_frequency
promptTemplates:
  heartbeat: |
    Quick check — review recent activity and report anomalies.
    Output: JSON action list or NO_ACTION.
  daily: |
    Daily review — summarize findings and plan actions.
    Output: structured daily report.
  weekly: |
    Weekly audit — comprehensive review with trend analysis.
    Output: weekly audit report with recommendations.
---

# {{displayName}} Specialist

You are a specialist agent for {{description}}.

## Capabilities

- Add your specialist's capabilities here

## Behavior

- Always check run history to avoid repeating recent work
- Report NO_ACTION when nothing needs attention
- Escalate critical findings immediately
`;

/**
 * Render the default template with name/description/displayName substitutions.
 */
export function getDefaultTemplate(name: string, description?: string): string {
  const desc = description || `${name} monitoring and analysis`;
  const displayName = name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return TEMPLATE
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{description\}\}/g, desc)
    .replace(/\{\{displayName\}\}/g, displayName);
}

/**
 * Scaffold a new specialist definition file.
 * When `options.content` is provided, validates it and writes directly (replacing the name in frontmatter).
 * When `options.content` is absent/empty, uses the default template.
 */
export function scaffoldSpecialist(
  name: string,
  options: { description?: string; content?: string } = {}
): string {
  const dir = getSpecialistsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, `${name}.md`);
  if (fs.existsSync(filePath)) {
    throw new Error(`Specialist "${name}" already exists at ${filePath}`);
  }

  if (options.content && options.content.trim()) {
    // Validate raw markdown through parseSpecialistDefinition
    parseSpecialistDefinition(options.content);

    // Replace the name field in frontmatter with the provided name
    const parsed = matter(options.content);
    parsed.data.name = name;
    const finalContent = matter.stringify(parsed.content, parsed.data);

    fs.writeFileSync(filePath, finalContent, 'utf-8');
  } else {
    const content = getDefaultTemplate(name, options.description);
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  return filePath;
}

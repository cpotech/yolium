/**
 * @module src/main/services/specialist-scaffold
 * Generate new specialist definition files from a template.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getSpecialistsDir } from './specialist-loader';

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
 * Scaffold a new specialist definition file.
 */
export function scaffoldSpecialist(
  name: string,
  options: { description?: string } = {}
): string {
  const dir = getSpecialistsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, `${name}.md`);
  if (fs.existsSync(filePath)) {
    throw new Error(`Specialist "${name}" already exists at ${filePath}`);
  }

  const description = options.description || `${name} monitoring and analysis`;
  const displayName = name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const content = TEMPLATE
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{description\}\}/g, description)
    .replace(/\{\{displayName\}\}/g, displayName);

  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

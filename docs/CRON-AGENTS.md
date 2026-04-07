# CRON Agent Scheduling System

Yolium's CRON agent scheduling system enables time-driven, autonomous agent execution with persistent memory, specialist role profiles, and adaptive behaviour.

## Getting Started

### Enabling Scheduling

1. Open the Schedule Panel: **Ctrl+Shift+H** or click "Scheduled Agents" in the sidebar
2. Toggle the global "Enable Scheduling" switch
3. Enable individual specialists as needed

### Built-in Specialists

Yolium ships with six built-in specialists:

| Specialist | Purpose |
|---|---|
| `security-monitor` | Scan commits for leaked secrets, audit dependencies, generate CVE reports |
| `codebase-health` | Check CI status, summarize failing tests, review technical debt |
| `twitter-growth` | Engagement monitoring, content planning, weekly performance audit |
| `bluesky-growth` | Reply-focused Bluesky engagement: monitor notifications, search conversations, reply |
| `email-scout` | Email-based lead scouting: monitor inbox, qualify opportunities, send outreach via IMAP/SMTP |
| `git-pattern-monitor` | Scan all projects for recurring git issues, propose AGENTS.md updates |

## Adding a New Specialist

Adding a specialist requires only a new `.md` file — zero code changes.

### 1. Create the Definition File

Create `src/agents/cron/my-specialist.md` (or use the scaffold feature in the Schedule Panel):

```markdown
---
name: my-specialist
description: What this specialist does
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

# My Specialist

You are a specialist agent for [describe purpose].

## Capabilities

- List capabilities here

## Behavior

- Always check run history to avoid repeating recent work
- Report NO_ACTION when nothing needs attention
- Escalate critical findings immediately
```

### 2. Reload

Click "Reload" in the Schedule Panel, or restart Yolium. The scheduler automatically discovers new `.md` files in `src/agents/cron/`.

### 3. Enable

Toggle the specialist's enable switch in the Schedule Panel.

## Editing an Existing Specialist

Existing scheduled agents can be edited directly in the app:

1. Open the Schedule Panel and click `Configure` on the specialist card.
2. In the config dialog, click `Edit definition`.
3. Update the markdown or switch to Guided mode, then click `Save`.

Edits are written back to the same `src/agents/cron/<specialist-id>.md` file in place. The specialist id stays locked during editing so scheduler state, run history, and stored credentials remain attached to the same agent.

## Specialist Definition Format

### YAML Frontmatter Fields

| Field | Required | Type | Description |
|---|---|---|---|
| `name` | Yes | string | Unique identifier |
| `description` | Yes | string | Human-readable description |
| `model` | Yes | `opus` \| `sonnet` \| `haiku` | Claude model to use |
| `tools` | Yes | string[] | Tools available to the agent |
| `timeout` | No | number | Inactivity timeout in minutes (default: 30) |
| `schedules` | Yes | ScheduleConfig[] | Cron schedules (see below) |
| `memory` | No | MemoryConfig | Memory strategy config |
| `escalation` | No | EscalationConfig | Escalation behavior |
| `promptTemplates` | No | Record<string, string> | Per-schedule-type prompt templates |
| `integrations` | No | ServiceIntegration[] | Service integrations requiring credentials |

### Integrations

Specialists can declare service integrations in their frontmatter. This tells Yolium which external services the specialist needs credentials for:

```yaml
integrations:
  - service: twitter-api
    env:
      TWITTER_API_KEY: ""
      TWITTER_API_SECRET: ""
  - service: slack
    env:
      SLACK_WEBHOOK_URL: ""
```

Each integration declares:
- `service` — A human-readable service identifier (any string)
- `env` — A map of environment variable names that the service requires

The actual credential values are stored in the SQLite database (`~/.yolium/yolium.db`, `credentials` table). Legacy `specialist-credentials.json` files are automatically migrated on first access. When a scheduled agent runs, its credentials are injected as environment variables into the Docker container.

### Managing Credentials

Credentials can be configured in two ways:

1. **Add Specialist Dialog** — When creating a specialist with a markdown definition that includes `integrations`, the credential fields auto-populate. Enter values before creating.
2. **Specialist Config Dialog** — Click on an existing specialist to view its configuration. The `Edit definition` action opens the same editor for in-place updates, and the `Service Credentials` section allows partial credential saves without clearing untouched keys for that service.

### Schedule Types

| Type | Typical Frequency | Purpose |
|---|---|---|
| `heartbeat` | Every 30 min | Quick health checks, catch anomalies |
| `daily` | Once per day | Maintenance, summaries, planning |
| `weekly` | Once per week | Deep audits, trend analysis, strategic review |
| `custom` | Any cron expression | Anything else |

### Cron Expression Format

Standard 5-field cron: `minute hour day-of-month month day-of-week`

Examples:
- `*/30 * * * *` — every 30 minutes
- `0 8 * * *` — daily at 8:00 AM UTC
- `0 7 * * 1` — weekly on Monday at 7:00 AM UTC
- `0 9 * * 1-5` — weekday mornings at 9:00 AM UTC

### Memory Strategies

| Strategy | Description |
|---|---|
| `distill_daily` | Summarize daily runs into a digest (auto-runs at 23:59 UTC) |
| `distill_weekly` | Summarize weekly runs into a digest (Sundays at 23:59 UTC) |
| `raw` | No distillation — inject raw run history |

### Escalation Actions

| Action | Trigger | Effect |
|---|---|---|
| `alert_user` | Consecutive failures | Sends alert to Yolium UI |
| `reduce_frequency` | Consecutive no-action runs | Logs recommendation to reduce polling |
| `pause` | Severe issues | Disables the specialist |
| `notify_slack` | Configurable | Slack webhook (future) |

## Memory System

Each specialist maintains persistent run history at `~/.yolium/schedules/{specialist-id}/run_history.jsonl`.

Before each run, the last 20 runs are injected into the agent's prompt as a `## Recent Run History` section. This allows agents to:

- Skip redundant work
- Detect patterns across runs
- Adapt behavior based on recent outcomes

### Distillation

For specialists using `distill_daily` or `distill_weekly`, a nightly job (23:59 UTC) summarizes run entries into `~/.yolium/schedules/{specialist-id}/digest.md`.

## Pattern Detection

The scheduler automatically monitors run outcomes:

| Pattern | Threshold | Action |
|---|---|---|
| Consecutive no-action | 3 runs | `reduce_frequency` |
| Consecutive failures | 3 runs | `alert_user` |
| Cost spike | 2x rolling average | `alert_user` |

## Run History & Cost Tracking

Every run is logged with:
- Specialist ID and schedule type
- Start/end timestamps
- Token usage and cost (USD)
- Outcome (`completed`, `no_action`, `failed`, `skipped`, `timeout`)
- Summary text

View run history in the Schedule Panel by clicking "History" on any specialist card.

## Conflict Resolution

If a heartbeat and a daily run trigger simultaneously for the same specialist, the second run is **skipped** with `outcome: 'skipped'`. Only one run per specialist at a time.

## Troubleshooting

### Specialist not appearing

- Verify the `.md` file is in `src/agents/cron/` (dev) or `resources/agents/cron/` (prod)
- Check that the filename doesn't start with `_`
- Validate YAML frontmatter has all required fields (`name`, `description`, `model`, `tools`, `schedules`)

### Agent not running

- Ensure global scheduling is enabled in the Schedule Panel
- Ensure the individual specialist is enabled
- Check that Claude authentication is configured in Settings
- Check logs for error messages

### High costs

- Use `haiku` model for heartbeat checks (cheapest)
- Disable heartbeat schedules for non-critical specialists
- Monitor weekly cost in the Schedule Panel
- Consider `distill_daily` memory strategy to keep context compact

## Cost Estimation

Approximate monthly costs per schedule type (using `haiku` model):

| Schedule | Frequency | Estimated Monthly Cost |
|---|---|---|
| Heartbeat (*/30) | 1440 runs/month | ~$4-8 |
| Daily | 30 runs/month | ~$0.50-2 |
| Weekly | 4 runs/month | ~$0.10-0.50 |

Actual costs depend on prompt length, memory context size, and agent output.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Schedule Panel (Renderer)                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────────┐  │
│  │ Specialist   │ │ Actions      │ │ Add/Edit/Config         │  │
│  │ Cards        │ │ View         │ │ Dialogs                 │  │
│  └──────┬───────┘ └──────┬───────┘ └────────────┬────────────┘  │
│         └────────────────┴──────────┬───────────┘               │
│                                     │ IPC (schedule:*)          │
├─────────────────────────────────────┼───────────────────────────┤
│  Main Process                       │                           │
│  ┌──────────────────────────────────┴────────────────────────┐  │
│  │ CronScheduler (singleton)                                 │  │
│  │ ┌────────────┐ ┌──────────────┐ ┌──────────────────────┐  │  │
│  │ │ node-cron  │ │ Pattern      │ │ Memory               │  │  │
│  │ │ Jobs       │ │ Detection    │ │ Distillation         │  │  │
│  │ └─────┬──────┘ └──────────────┘ └──────────────────────┘  │  │
│  └───────┼───────────────────────────────────────────────────┘  │
│          │ triggers                                              │
│  ┌───────┴───────────────────────────────────────────────────┐  │
│  │ Scheduled Agent Runner (headless)                          │  │
│  │ ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐  │  │
│  │ │ Docker       │ │ Protocol     │ │ Cost & Token       │  │  │
│  │ │ Container    │ │ Parser       │ │ Tracking           │  │  │
│  │ └──────────────┘ └──────────────┘ └────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│          │                                                       │
│  ┌───────┴───────────────────────────────────────────────────┐  │
│  │ SQLite (yolium.db)                                         │  │
│  │ ┌───────────────┐ ┌──────┐ ┌─────────┐ ┌──────────────┐   │  │
│  │ │schedule_state │ │ runs │ │ actions │ │ credentials  │   │  │
│  │ └───────────────┘ └──────┘ └─────────┘ └──────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | File | Role |
|---|---|---|
| `CronScheduler` | `src/main/services/scheduler.ts` | Singleton that manages `node-cron` jobs, pattern detection, escalation, and memory distillation |
| `startScheduledAgent` | `src/main/services/agent-scheduled.ts` | Launches a headless agent container, injects credentials and memory context, parses output |
| `specialist-loader.ts` | `src/main/services/specialist-loader.ts` | Parses `.md` files with YAML frontmatter into `SpecialistDefinition` objects |
| `schedule-db.ts` | `src/main/stores/schedule-db.ts` | SQLite persistence for schedule state, runs, actions, and credentials |
| `schedule-handlers.ts` | `src/main/ipc/schedule-handlers.ts` | IPC handler registration for all `schedule:*` channels |
| `SchedulePanel.tsx` | `src/renderer/components/schedule/SchedulePanel.tsx` | Main scheduling UI with specialist cards, actions view, and configuration |

### Execution Flow

1. `CronScheduler.start()` loads all specialist definitions and registers `node-cron` jobs
2. When a cron job fires, the scheduler checks: is the specialist enabled? Is another run already in progress? Should it skip (`skipEveryN`)?
3. If the run proceeds, `startScheduledAgent()` creates a headless Docker container with:
   - The specialist's system prompt + schedule-type prompt template
   - Recent run history injected as context
   - Service credentials as environment variables
4. The agent executes, emitting `@@YOLIUM:{type,data}` protocol messages
5. On completion, `handleRunComplete()` records the run in SQLite, checks for patterns, and triggers escalation if needed
6. State changes are broadcast to the renderer via `schedule:state-changed` events

## IPC API Reference

All scheduling IPC channels use the `schedule:` namespace. Full type signatures are in [IPC.md](IPC.md).

### Queries

| Channel | Parameters | Returns | Description |
|---|---|---|---|
| `schedule:get-state` | — | `ScheduleState` | Full state: global toggle, all specialist statuses |
| `schedule:get-specialists` | — | `SpecialistDefinition[]` | Loaded specialist metadata |
| `schedule:get-history` | `(id, limit?)` | `ScheduledRun[]` | Recent runs for a specialist (default 50) |
| `schedule:get-stats` | `(id)` | `RunStats` | Success rate, weekly cost, average duration |
| `schedule:get-run-log` | `(id, runId)` | `string` | Full display output log for a run |
| `schedule:get-raw-definition` | `(name)` | `string` | Raw markdown content of a specialist file |
| `schedule:get-credentials` | `(id)` | `Record<string, Record<string, boolean>>` | Redacted credential flags (has-secret, not values) |
| `schedule:get-actions` | `(id, limit?)` | `ActionRecord[]` | Recent action logs for a specialist |
| `schedule:get-all-actions` | `(ids[], limit?)` | `ActionRecord[]` | Actions across multiple specialists |
| `schedule:get-run-actions` | `(id, runId)` | `ActionRecord[]` | Actions from a specific run |
| `schedule:get-action-stats` | `(id)` | `Record<string, number>` | Aggregated action type counts |

### Mutations

| Channel | Parameters | Returns | Description |
|---|---|---|---|
| `schedule:toggle-specialist` | `(id, enabled)` | `void` | Enable or disable a specialist |
| `schedule:toggle-global` | `(enabled)` | `void` | Enable or disable all scheduling |
| `schedule:trigger-run` | `(id, type)` | `void` | Manually trigger a run |
| `schedule:reload` | — | `void` | Reload specialist definitions from disk |
| `schedule:scaffold` | `(name, options?)` | `string` | Create a new specialist `.md` file, returns file path |
| `schedule:update-definition` | `(name, content)` | `void` | Save edited specialist definition |
| `schedule:save-credentials` | `(id, serviceId, creds)` | `void` | Save service credentials |
| `schedule:delete-credentials` | `(id)` | `void` | Delete all credentials for a specialist |
| `schedule:reset-specialist` | `(id)` | `void` | Clear runs, actions, logs, workspace, and counters |
| `schedule:get-template` | `(name, description?)` | `string` | Get a default template for a new specialist |

### Events (Main → Renderer)

| Event | Payload | Description |
|---|---|---|
| `schedule:alert` | `(specialistId, message)` | Escalation alert for the UI |
| `schedule:state-changed` | `ScheduleState` | Broadcast after run completion or state mutation |

## Action Logging

Every action taken by a scheduled agent is recorded in the `actions` table, providing a full audit trail.

### How Actions Are Recorded

Agents emit protocol messages during execution:
```
@@YOLIUM:{"type":"action","data":{"action":"commit","details":"Fixed CVE-2024-1234"}}
```

The scheduled agent runner parses these and persists them to SQLite with:
- `specialist_id` — which specialist performed the action
- `run_id` — which specific run
- `action` — action type (e.g., `commit`, `post_tweet`, `scan_complete`)
- `data` — JSON payload with action-specific details
- `timestamp` — when the action occurred

### Viewing Actions

The **Actions View** in the Schedule Panel shows a chronological feed of all actions across specialists. You can filter by:
- Specialist (dropdown)
- Action type (dropdown, populated from actual recorded types)

### Action Statistics

Use `schedule:get-action-stats` to get aggregated counts per action type for a specialist — useful for dashboards or monitoring how frequently each action fires.

## File System Layout

```
~/.yolium/
├── yolium.db                              # SQLite database (schedule_state, runs, actions, credentials)
└── schedules/
    └── {specialist-id}/
        ├── workspace/                     # Agent's working directory
        ├── digest.md                      # Memory distillation output
        └── runs/
            └── {runId}.log               # Per-run display output log

src/agents/cron/                           # Built-in specialist definitions (dev)
resources/agents/cron/                     # Built-in specialist definitions (prod)
~/.yolium/agents/cron/custom/              # User-created custom specialists
```

## Custom Specialist Locations

Yolium loads specialists from multiple directories in priority order:

1. **Custom** (`~/.yolium/agents/cron/custom/`) — user-created specialists, never overwritten by updates
2. **Built-in dev** (`src/agents/cron/`) — shipped specialists during development
3. **Built-in prod** (`resources/agents/cron/`) — shipped specialists in packaged app

If a custom specialist has the same `name` as a built-in one, the custom definition takes precedence.

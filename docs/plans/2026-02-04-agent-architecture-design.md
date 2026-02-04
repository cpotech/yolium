# Agent Architecture Design

**Date:** 2026-02-04
**Status:** Approved

## Overview

Yolium agents are defined as markdown files in `src/agents/`. They run in Docker containers, communicate via a protocol, and integrate with the Kanban work item system.

## Key Decisions

1. **All agents run in containers** - Including Plan Agent
2. **Full auto-bypass permissions** - Agents run with `--dangerously-skip-permissions`
3. **Protocol-based communication** - `@@YOLIUM:` JSON messages in stdout
4. **Async question flow** - Agent posts question → exits → user answers → Resume
5. **Role-based organization** - Each agent is a separate `.md` file
6. **Plan Agent only initially** - Other agents added in future releases
7. **Plan Agent uses Opus** - Best model for planning/reasoning work
8. **Non-blocking UI** - All agent work runs in background
9. **Session recovery** - Comments are source of truth, app restart continues from history

## Agent File Structure

```
src/agents/
├── plan-agent.md          # Plan Agent definition
├── README.md              # Documents how to add new agents
└── _protocol.md           # Shared protocol reference
```

## Agent File Format

Following Claude Code plugin pattern:

```markdown
---
name: plan-agent
description: Decomposes high-level goals into structured work items
model: opus
tools:
  - Read
  - Glob
  - Grep
  - WebSearch
---

# Plan Agent

System prompt content here...
```

- **Frontmatter**: Metadata (name, model, allowed tools)
- **Body**: System prompt injected when agent runs

## Protocol Messages

Agents communicate via `@@YOLIUM:` JSON messages in stdout:

### Ask Question

Pauses agent, waits for user input:

```json
@@YOLIUM:{"type":"ask_question","text":"Which authentication method?","options":["OAuth","JWT","Session"]}
```

- `text` (required): The question
- `options` (optional): Multiple-choice answers

### Create Work Item

Adds item to Kanban Backlog:

```json
@@YOLIUM:{"type":"create_item","title":"Add JWT auth","description":"Detailed instructions...","branch":"feature/jwt-auth","agentType":"claude","order":1}
```

- `title`: Short title
- `description`: Detailed instructions with acceptance criteria
- `branch`: Git branch name
- `agentType`: `claude` | `codex` | `opencode` | `shell`
- `order`: Suggested execution sequence

### Complete

Signals planning finished:

```json
@@YOLIUM:{"type":"complete","summary":"Created 4 work items for authentication"}
```

### Error

Signals planning failed:

```json
@@YOLIUM:{"type":"error","message":"Could not analyze - no package.json found"}
```

## Agent Status Flow

```
idle → running → waiting → running → completed
                    ↑          ↓
                    └── (user answers, clicks Resume)
```

Additional status for recovery:
- `interrupted`: Agent was running when app closed

## Integration Flow

### Starting an Agent

1. Load agent definition from `src/agents/<name>.md`
2. Build prompt: agent system prompt + goal + conversation history
3. Run Claude Code in container:
   ```bash
   claude --model opus -p "$PROMPT" --allowedTools "Read,Glob,Grep,WebSearch"
   ```
4. Parse stdout for `@@YOLIUM:` messages in real-time
5. Update work item and emit `kanban:board-updated` events

### Question Flow

1. Agent outputs `ask_question` message
2. Host posts question as comment on work item
3. Host sets `agentStatus: 'waiting'`
4. Host stops container
5. User sees question in UI, answers via comment
6. User clicks "Resume"
7. Host rebuilds prompt with full conversation history
8. Host restarts container
9. Agent continues planning

### Session Recovery

On app startup:

| Status | Action |
|--------|--------|
| `waiting` | No action - UI shows question, user can answer + Resume |
| `running` | Set to `interrupted`, add system comment, user can Resume |
| `completed` | No action |
| `failed` | No action - user can view error and retry |

Conversation history reconstructed from comments:

```typescript
function buildConversationHistory(item: KanbanItem): string {
  return item.comments
    .map(c => `[${c.source}]: ${c.text}`)
    .join('\n\n');
}
```

## Key Implementation Files

| File | Purpose |
|------|---------|
| `src/agents/plan-agent.md` | Plan Agent definition |
| `src/agents/README.md` | How to add new agents |
| `src/lib/agent-loader.ts` | Parses agent `.md` files from `src/agents/` |
| `src/lib/agent-protocol.ts` | Parses `@@YOLIUM:` messages from stdout |
| `src/lib/agent-runner.ts` | Container lifecycle, resume, recovery |
| `src/types/kanban.ts` | KanbanItem with agent status fields |

## Type Additions

```typescript
// In src/types/kanban.ts

export type AgentStatus =
  | 'idle'
  | 'running'
  | 'waiting'      // NEW: waiting for user input
  | 'interrupted'  // NEW: was running when app closed
  | 'completed'
  | 'failed';

export interface KanbanItem {
  // ... existing fields
  agentStatus: AgentStatus;
  agentQuestion?: string;           // Current question (if waiting)
  agentQuestionOptions?: string[];  // Optional choices for question
}
```

## UI Behavior

**Non-blocking**: All agent work runs in background. User can:
- Continue working in terminal tabs
- Switch to other work items
- Close the app (agent keeps running until container stops)

**Status indicators**:
- `running`: Spinner on card, live output panel
- `waiting`: Yellow "Needs input" badge, question displayed
- `interrupted`: Orange "Interrupted" badge, Resume button
- `completed`: Green checkmark, summary shown
- `failed`: Red badge, error message

**Notifications** (toast messages):
- Agent posts question: "Plan Agent needs input on [Item Title]"
- Agent completes: "Plan Agent created N work items"
- Agent fails: "Plan Agent failed: [error]"

## Future Extensibility

Adding new agents:

1. Create `src/agents/<name>.md` with frontmatter + system prompt
2. Agent automatically discovered by `agent-loader.ts`
3. Same protocol, same runner infrastructure

Planned future agents:
- **Code Agent** - Executes coding tasks
- **Verify Agent** - Validates work after Code Agent
- **Review Agent** - Assists with code review

## Plan Agent Definition

See `src/agents/plan-agent.md` for the complete agent definition.

Key behaviors:
- Uses Opus model for best reasoning
- Explores codebase with Read, Glob, Grep, WebSearch
- Asks questions ONE AT A TIME (async)
- Creates atomic, independent work items
- Chooses appropriate agent type for each item

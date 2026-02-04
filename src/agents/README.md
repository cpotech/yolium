# Yolium Agents

Agents are specialized AI workers that perform specific tasks within the Yolium Kanban workflow.

## Directory Structure

```
src/agents/
├── plan-agent.md    # Decomposes goals into work items
├── README.md        # This file
└── (future agents)
```

## Adding a New Agent

1. Create `src/agents/<name>-agent.md`
2. Add frontmatter with required fields
3. Write the system prompt in the body
4. Agent is automatically discovered on app restart

## Agent File Format

```markdown
---
name: agent-name
description: What this agent does
model: opus | sonnet | haiku
tools:
  - Read
  - Glob
  - Grep
  - (other allowed tools)
---

# Agent Name

System prompt content here. This is injected as the system prompt
when the agent runs in a container.

## Instructions

Detailed instructions for the agent...
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier (kebab-case) |
| `description` | Yes | Short description of agent's role |
| `model` | Yes | `opus` (best), `sonnet` (balanced), `haiku` (fast) |
| `permissions` | No | `auto-bypass` for full autonomous operation (default) |
| `tools` | No | List of allowed Claude Code tools |

### Permissions

All agents run with `--dangerously-skip-permissions` by default, enabling fully autonomous operation. This allows agents to:
- Read and write files without prompts
- Execute bash commands
- Make network requests

This is intentional for Yolium's background agent workflow.

### Model Selection

- **opus**: Complex reasoning, planning, architecture decisions
- **sonnet**: Balanced speed/quality, most coding tasks
- **haiku**: Fast, simple tasks, quick edits

## Protocol

Agents communicate with Yolium via `@@YOLIUM:` JSON messages in stdout.

### Available Commands

**Ask Question** (pauses agent, waits for user):
```
@@YOLIUM:{"type":"ask_question","text":"Your question","options":["A","B"]}
```

**Create Work Item** (adds to Kanban Backlog):
```
@@YOLIUM:{"type":"create_item","title":"...","description":"...","branch":"...","agentType":"claude","order":1}
```

**Complete** (signals agent finished successfully):
```
@@YOLIUM:{"type":"complete","summary":"What was accomplished"}
```

**Error** (signals agent failed):
```
@@YOLIUM:{"type":"error","message":"What went wrong"}
```

## Agent Lifecycle

```
idle → running → waiting → running → completed
                    ↑          ↓
                    └── user answers question
```

- **idle**: Agent not running
- **running**: Agent executing in container
- **waiting**: Agent asked a question, waiting for user
- **completed**: Agent finished successfully
- **failed**: Agent encountered an error
- **interrupted**: Agent was running when app closed (can Resume)

## Best Practices

1. **Ask one question at a time** - Easier for users, cleaner flow
2. **Keep work items atomic** - Each should be independently testable
3. **Include acceptance criteria** - Clear definition of done
4. **Choose appropriate agent types** - Match complexity to capability
5. **Use conventional branches** - `feature/`, `fix/`, `refactor/`

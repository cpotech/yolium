# Agent Docker Integration Design

**Date:** 2026-02-04
**Status:** Approved

## Overview

Plan Agent runs as a headless Docker container that executes Claude Code with `--dangerously-skip-permissions`, parses `@@YOLIUM:` protocol messages from stdout, and creates Kanban work items.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  agent-runner   │────▶│  docker-manager  │────▶│    Container    │
│  (orchestrator) │     │  (lifecycle)     │     │  (Claude Code)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │                        │
        │                        │◀───── stdout ──────────┤
        │◀── protocol messages ──│                        │
        │                        │                        │
        ▼                        │                        │
┌─────────────────┐              │                        │
│  kanban-store   │              │                        │
│  (persistence)  │              │                        │
└─────────────────┘              │                        │
```

**Key principle:** Each question/answer cycle is a fresh container with accumulated context from comments.

## Container Configuration

### New Function: `createAgentContainer()`

```typescript
interface AgentContainerParams {
  webContentsId: number;
  projectPath: string;        // Project to mount
  agentName: string;          // e.g., 'plan-agent'
  prompt: string;             // Full prompt (system + goal + history)
  model: string;              // 'opus', 'sonnet', 'haiku'
  tools: string[];            // ['Read', 'Glob', 'Grep', 'WebSearch']
  itemId: string;             // Kanban item being worked on
}
```

### Container Settings

- `Tty: false` - Headless, no terminal
- `OpenStdin: false` - No input needed
- Mounts: project directory + `~/.claude` (for auth)
- Environment variables:
  - `TOOL=agent`
  - `AGENT_PROMPT=<base64-encoded>` - Prompt encoded to handle multi-line/special chars
  - `AGENT_MODEL=opus`
  - `AGENT_TOOLS=Read,Glob,Grep,WebSearch`

### Entrypoint Changes

Add `agent` mode to `entrypoint.sh`:

```bash
elif [[ "$TOOL" == "agent" ]]; then
  PROMPT=$(echo "$AGENT_PROMPT" | base64 -d)
  claude --model "$AGENT_MODEL" -p "$PROMPT" \
    --allowedTools "$AGENT_TOOLS" \
    --dangerously-skip-permissions
```

## Protocol Message Flow

### Real-time Parsing

```typescript
stdout.on('data', (data: Buffer) => {
  const text = data.toString();

  // Forward raw output for UI display
  params.onOutput(text);

  // Extract and forward protocol messages
  const messages = extractProtocolMessages(text);
  for (const msg of messages) {
    params.onProtocolMessage(msg);
  }
});
```

### Message Handling

| Message | Action |
|---------|--------|
| `ask_question` | Update item status → `waiting`, store question, container exits |
| `create_item` | Add new Kanban item to backlog |
| `complete` | Update item status → `completed`, cleanup |
| `error` | Update item status → `failed`, store error |

### Resume Flow

1. User submits answer via UI → `addComment(board, itemId, 'user', answer)`
2. User clicks "Resume" → calls `resumeAgent(itemId)`
3. `resumeAgent()`:
   - Rebuilds prompt with full conversation history from comments
   - Calls `createAgentContainer()` with new prompt
   - Agent continues from where it left off

```
startAgent() → container runs → ask_question → container exits
                                     ↓
user answers → resumeAgent() → new container → complete → done
```

## Agent File Bundling

Agent markdown files need to work in both development and production.

### File Locations

- **Development:** `src/agents/*.md`
- **Production:** `resources/agents/*.md` (copied during build)

### Updated agent-loader.ts

```typescript
import { app } from 'electron';

function getAgentsDir(): string {
  // Development: src/agents
  const devPath = path.join(app.getAppPath(), 'src', 'agents');
  if (fs.existsSync(devPath)) return devPath;

  // Production: resources/agents
  const prodPath = path.join(process.resourcesPath, 'agents');
  if (fs.existsSync(prodPath)) return prodPath;

  throw new Error('Agents directory not found');
}

export function loadAgentDefinition(agentName: string): ParsedAgent {
  const agentsDir = getAgentsDir();
  const agentPath = path.join(agentsDir, `${agentName}.md`);
  // ... rest of implementation
}
```

### Build Configuration

Add to `forge.config.ts` extraResources:

```typescript
extraResource: [
  'src/docker',
  'src/agents',  // Add this
],
```

## Error Handling

### Container Failures

| Scenario | Detection | Action |
|----------|-----------|--------|
| Container crashes | Exit code ≠ 0, no `complete`/`error` msg | Set status → `failed`, add system comment |
| Claude auth missing | Exit code 1, auth error in stderr | Set status → `failed`, prompt user to auth |
| Container timeout | No output for 10 min | Kill container, set status → `interrupted` |
| App closes mid-run | On startup, check for `running` status | Set status → `interrupted`, user can resume |

### Timeout Implementation

```typescript
let lastOutput = Date.now();
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

stdout.on('data', () => { lastOutput = Date.now(); });

const timeoutCheck = setInterval(() => {
  if (Date.now() - lastOutput > TIMEOUT_MS) {
    container.kill();
    clearInterval(timeoutCheck);
  }
}, 30000);
```

### Validation Before Start

- Check Claude auth exists (`~/.claude` has credentials)
- Check Docker is available
- Check project path exists

## Files to Modify

| File | Changes |
|------|---------|
| `src/docker-manager.ts` | Add `createAgentContainer()`, `stopAgentContainer()` |
| `src/docker/entrypoint.sh` | Add `agent` tool mode |
| `src/lib/agent-runner.ts` | Connect `startAgent()` to Docker, add `resumeAgent()` |
| `src/lib/agent-loader.ts` | Use `getAgentsDir()` for dev/prod paths |
| `src/main.ts` | Wire up IPC for agent container events |
| `src/preload.ts` | Expose agent container events to renderer |
| `forge.config.ts` | Add `src/agents` to extraResources |

## Testing Strategy

### Unit Tests

```typescript
// src/tests/docker-manager.test.ts (additions)
describe('createAgentContainer', () => {
  it('should create container with correct env vars');
  it('should base64 encode prompt in AGENT_PROMPT');
  it('should forward protocol messages via callback');
  it('should handle container exit with code 0');
  it('should handle container crash (exit code != 0)');
  it('should cleanup container on completion');
});

// src/tests/agent-loader.test.ts (additions)
describe('getAgentsDir', () => {
  it('should return dev path when src/agents exists');
  it('should return prod path when only resources/agents exists');
  it('should throw when neither exists');
});
```

### Entrypoint Tests

```typescript
// src/tests/entrypoint.test.ts (additions)
describe('agent tool mode', () => {
  it('should decode base64 prompt');
  it('should pass correct args to claude');
  it('should handle missing AGENT_PROMPT');
});
```

### Manual E2E Testing

1. Create a Kanban item with Plan Agent
2. Start agent → verify container runs
3. Agent asks question → verify UI shows question
4. Answer + Resume → verify new container continues
5. Agent completes → verify items created in backlog

## Not In Scope

- UI components for agent output panel
- Toast notifications for agent events
- Multiple concurrent agents
- Agents other than Plan Agent

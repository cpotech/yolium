# Yolium Agent Protocol Reference

Agents communicate with Yolium via JSON messages prefixed with `@@YOLIUM:` in stdout.

## Message Types

### ask_question

Pauses agent execution and waits for user input.

```json
{"type":"ask_question","text":"Question?","options":["A","B"]}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| text | string | yes | The question to display |
| options | string[] | no | Multiple choice options |

### create_item

Creates a Kanban work item in the Backlog.

```json
{"type":"create_item","title":"Title","description":"Details","branch":"feature/x","agentType":"claude","order":1,"model":"sonnet"}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | yes | Short title for the card |
| description | string | yes | Full instructions |
| branch | string | no | Suggested branch name |
| agentType | enum | yes | claude, codex, opencode |
| order | number | yes | Execution order (1 = first) |
| model | string | no | Model override: opus, sonnet, haiku |

### progress

Reports real-time step progress from the agent (does not pause execution).

```json
{"type":"progress","step":"implement","detail":"Writing auth middleware","attempt":2,"maxAttempts":5}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| step | string | yes | Step identifier (e.g., analyze, implement, push) |
| detail | string | yes | Human-readable description of current action |
| attempt | number | no | Current attempt number (for retry loops) |
| maxAttempts | number | no | Maximum retry attempts |

### complete

Signals successful completion.

```json
{"type":"complete","summary":"Created 4 work items"}
```

### error

Signals failure.

```json
{"type":"error","message":"Reason for failure"}
```

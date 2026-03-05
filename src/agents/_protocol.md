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
{"type":"create_item","title":"Title","description":"Details","branch":"feature/x","agentProvider":"claude","order":1,"model":"sonnet"}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | yes | Short title for the card |
| description | string | no | Full instructions (defaults to empty) |
| branch | string | no | Suggested branch name |
| agentProvider | enum | yes | claude, codex, opencode |
| order | number | yes | Execution order (1 = first) |
| model | string | no | Model override: opus, sonnet, haiku |

### add_comment

Adds a comment to the current work item without pausing execution. Use this to write analysis summaries, progress updates, or final plans to the comment thread.

```json
{"type":"add_comment","text":"## Analysis\n\nThe codebase uses..."}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| text | string | yes | The comment text (supports markdown) |

### update_description

Updates the description of the current work item. Agents use this to improve or refine the work item description as they analyze requirements.

```json
{"type":"update_description","description":"Updated detailed description of the work item"}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| description | string | yes | New description text for the work item |

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

### comment

Posts detailed commentary to the work item (shown as agent message). Use this to share analysis findings, implementation details, test results, and other substantive information with the user.

```json
{"type":"comment","text":"Found 3 relevant files: src/auth.ts, src/middleware.ts, src/routes/login.ts. The auth module uses JWT tokens with a 24h expiry."}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| text | string | yes | The commentary text to post |

### set_test_specs

Attaches concrete test specifications to the current work item. Used by plan agents to define tests that the code agent will implement first (TDD).

```json
{"type":"set_test_specs","specs":[{"file":"src/tests/foo.test.ts","description":"Unit tests for foo module","specs":["should return empty array when no items","should throw on invalid input"]}]}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| specs | array | yes | Array of test spec objects |
| specs[].file | string | yes | Test file path |
| specs[].description | string | yes | What the test file covers |
| specs[].specs | string[] | yes | Individual test case descriptions |

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

## Link Protocols

### yolium-report://

Use `yolium-report://` links in comments to link to HTML test reports. When rendered in the Yolium UI, these links appear as clickable "View Report" buttons that open the report in a new window with full JavaScript execution.

**Format:** `yolium-report://{absolute-path-to-report-index.html}`

**Example in markdown comment:**
```
- [View Report: vitest-report](yolium-report:///home/user/project/vitest-report/index.html)
- [View Report: playwright-report](yolium-report:///home/user/project/playwright-report/index.html)
```

The path must be an absolute path to the report's `index.html` file. Only include report links for files that exist on disk.

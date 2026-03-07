# Agent Workflows

Yolium orchestrates AI agents in a **Plan → Code → Verify** pipeline for development tasks, plus specialized agents for business intelligence and marketing.

```
Development Pipeline:
┌──────────┐     ┌──────────┐     ┌──────────┐
│   Plan   │────▶│   Code   │────▶│  Verify  │
│  Agent   │     │  Agent   │     │  Agent   │
└──────────┘     └──────────┘     └──────────┘
 Analyzes &       Implements,      Reviews code
 plans work       tests, commits   for correctness

Specialized Agents:
┌──────────┐     ┌────────────┐
│  Scout   │     │ Marketing  │
│  Agent   │     │  Agent     │
└──────────┘     └────────────┘
 Lead gen &       CRO, SEO, copy,
 prospecting      ads, strategy
```

## Plan Agent

The Plan Agent analyzes the codebase and produces a structured implementation plan. It does not write code.

**Process:**

1. **Analyze** — Uses Glob, Grep, and Read to explore the project structure, tech stack, and relevant files, including in-scope simplification/dead-code opportunities. Posts an analysis summary as a comment.
2. **Clarify** — If the goal is ambiguous or there are meaningful design choices, asks the user one question at a time. Skips this step if requirements are clear.
3. **Write Plan** — Produces a structured plan: context, approach, ordered steps with file references (including cleanup/simplification and dead-code removal when applicable), files-to-modify table, and acceptance criteria with checkboxes.
4. **Deliver** — Posts the plan as a comment, writes it to the work item description (so Code Agent can read it), and signals completion.

**Tools:** Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch
**Model:** opus
**Definition:** [`src/agents/plan-agent.md`](../src/agents/plan-agent.md)

## Code Agent

The Code Agent implements changes autonomously: writes code and tests, runs tests, and commits to the local branch.

**Process:**

1. **Analyze** — Reads the work item description and explores relevant files to understand requirements and existing patterns.
2. **Verify Branch** — Confirms it's on the correct isolated worktree branch (never creates or switches branches).
3. **Implement** — Writes clean, minimal code following existing conventions. Makes atomic, focused, behavior-preserving changes and removes in-scope dead code/unnecessary complexity when relevant.
4. **Write Tests** — Adds unit tests covering the happy path and key edge cases. Does not write E2E tests (those run in CI).
5. **Run Tests** — Runs `npm test` and fixes any failures until all tests pass.
6. **Commit** — Stages and commits with conventional commit messages (`feat:`, `fix:`, `test:`, etc.). Does not push to remote.
7. **Signal Completion** — Posts a summary of all changes made and signals completion.

**Tools:** Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch
**Model:** opus | **Timeout:** 60 min
**Definition:** [`src/agents/code-agent.md`](../src/agents/code-agent.md)

## Verify Agent

The Verify Agent is a read-only reviewer. It inspects changes made by a Code Agent (or a human) and produces a structured verification report. It never modifies files.

**Process:**

1. **Analyze Context** — Reads the work item and conversation history to understand what was attempted.
2. **Inspect Changes** — Runs `git diff main...HEAD` and `git log main..HEAD` to see all changes and commits.
3. **Read Guidelines** — Finds and reads `CLAUDE.md` files to understand project rules and conventions.
4. **Validate Completeness** — Checks each acceptance criterion against actual code (not just agent claims), explicitly verifies simplification/dead-code expectations for changed files, and runs `npm test`.
5. **Review Quality** — Assesses for over-engineering, unnecessary complexity, dead code, scope creep, and quality of in-scope cleanup execution.
6. **Check Compliance** — Verifies code style, testing requirements, git rules, and architecture patterns from guidelines.
7. **Deliver Verdict** — Posts a structured verification report with one of three verdicts:
   - **APPROVED** — All criteria met, no critical issues, tests pass, no avoidable in-scope dead code/complexity remains
   - **NEEDS REVISION** — Most criteria met but has issues that should be fixed (including avoidable in-scope dead code/complexity)
   - **REJECTED** — Criteria not met, critical issues, or tests fail

**Tools:** Read, Glob, Grep, Bash
**Model:** opus | **Timeout:** 30 min
**Definition:** [`src/agents/verify-agent.md`](../src/agents/verify-agent.md)

## Scout Agent

The Scout Agent is a lead-generation and business intelligence operative. It discovers, qualifies, and profiles businesses matching a campaign brief using web research. It does not write code or contact businesses.

**Process:**

1. **Interpret Brief** — Reads the work item to understand the campaign's target criteria, ideal customer profile, and geographic/industry focus.
2. **Discover** — Uses web search to find businesses matching the brief's criteria.
3. **Qualify** — Grades each prospect (A/B/C/D) based on how well they match the brief's requirements.
4. **Profile** — Builds detailed dossiers for qualified prospects with actionable intelligence.
5. **Deliver** — Writes structured JSON dossiers to `scout-dossier.json` and signals completion.

**Tools:** Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch
**Model:** opus | **Timeout:** 60 min
**Definition:** [`src/agents/scout-agent.md`](../src/agents/scout-agent.md)

## Marketing Agent

The Marketing Agent executes marketing tasks by routing to specialized skills. It covers 25 skills across 7 categories: Conversion Optimization, Content & Copy, SEO & Discovery, Paid & Distribution, Testing & Measurement, Growth Engineering, and Strategy & Planning.

**Process:**

1. **Identify Skill** — Reads the work item goal and matches it to the appropriate marketing skill(s).
2. **Load Methodology** — Loads the full skill file from `/opt/marketing-skills/<skill-name>/SKILL.md`.
3. **Check Context** — Looks for a product marketing context document to inform execution.
4. **Execute** — Applies the skill's methodology to produce deliverables (copy, audits, strategies, analyses, etc.).
5. **Deliver** — Posts results as comments and signals completion.

**Tools:** Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch
**Model:** opus | **Timeout:** 60 min
**Definition:** [`src/agents/marketing-agent.md`](../src/agents/marketing-agent.md)

## Agent Memory

Agents maintain conversational context across sessions through the comment thread on each work item.

When an agent starts (or resumes), Yolium calls `buildConversationHistory()` ([`kanban-store.ts:216`](../src/main/stores/kanban-store.ts#L216)) to collect all comments on the work item — from users, system events, and previous agent runs. This history is appended to the agent's prompt via `buildAgentPrompt()` ([`agent-runner.ts:56`](../src/main/services/agent-runner.ts#L56)) with the instruction "Continue from where you left off."

This means:
- A **Code Agent** can read the Plan Agent's analysis and implementation plan from the comment thread.
- A **Verify Agent** can see what the Code Agent claimed to have done and check it against actual changes.
- Any agent can be **resumed** after being paused (e.g., after answering a question) and it picks up with full context.

Agent output is also persisted to per-work-item log files via the workitem log store ([`workitem-log-store.ts`](../src/main/stores/workitem-log-store.ts)), providing a durable record of each agent's activity.

## The Protocol

Agents communicate with Yolium via `@@YOLIUM:{type,data}` JSON messages embedded in stdout. This keeps the control channel simple — no sidecar process, no separate socket. The main process parses these messages from the agent's output stream using [`agent-protocol.ts`](../src/main/services/agent-protocol.ts).

Message types include:

| Type | Purpose |
|------|---------|
| `progress` | Real-time step updates (does not pause) |
| `comment` / `add_comment` | Post commentary to the work item thread |
| `ask_question` | Pause and wait for user input |
| `update_description` | Overwrite the work item description |
| `create_item` | Create a new kanban work item |
| `complete` | Signal successful completion |
| `error` | Signal failure |

Full protocol reference: [`src/agents/_protocol.md`](../src/agents/_protocol.md)

## Custom Agents

Yolium agents follow a Unix philosophy: each agent is a small, single-purpose tool defined as a Markdown file. The agent loader ([`agent-loader.ts`](../src/main/services/agent-loader.ts)) auto-discovers all `*.md` files in `src/agents/`, excluding files that start with `_` and `README.md`.

### Creating an Agent

1. Create `src/agents/your-agent.md`
2. Add YAML frontmatter with required fields
3. Write the system prompt below the frontmatter
4. The agent is immediately available — no code changes needed

### YAML Frontmatter Schema

```yaml
---
name: your-agent          # Unique identifier (required)
description: What it does  # Short description (required)
model: sonnet              # opus | sonnet | haiku (required)
tools:                     # Tool list (required)
  - Read
  - Glob
  - Grep
  - Bash
timeout: 30                # Minutes, optional (default: none)
---
```

### System Prompt

Below the frontmatter, write the agent's system prompt in Markdown. This is the full instruction set the agent receives. Include:

- **Role definition** — What the agent does and doesn't do
- **Process steps** — Ordered steps with clear expectations
- **Protocol usage** — How to send `@@YOLIUM:` messages for progress, comments, questions, and completion
- **Rules** — Constraints and guardrails

### Protocol Contract

Any agent that speaks the `@@YOLIUM:` protocol works with Yolium. At minimum, an agent should:

1. Send `progress` messages to keep the UI updated
2. Send a `complete` or `error` message when done

See the [Protocol](#the-protocol) section above and [`_protocol.md`](../src/agents/_protocol.md) for the full message reference.

### Minimal Example

```markdown
---
name: lint-agent
description: Runs linters and reports issues
model: haiku
tools:
  - Read
  - Bash
  - Glob
timeout: 10
---

# Lint Agent

You are the Lint Agent. Run the project's linters and report any issues found.

## Process

1. Run `npm run lint` and capture output
2. If issues are found, post them as a comment
3. Signal completion with a summary

## Protocol

Use `@@YOLIUM:{"type":"progress","step":"lint","detail":"Running linters"}` to report progress.
Use `@@YOLIUM:{"type":"comment","text":"..."}` to post findings.
Use `@@YOLIUM:{"type":"complete","summary":"..."}` when done.
```

## Available Agents

| Agent | File | Purpose |
|-------|------|---------|
| Plan Agent | `plan-agent.md` | Analyzes codebase and produces implementation plans with in-scope simplification/dead-code guidance |
| Code Agent | `code-agent.md` | Implements code changes, simplifies touched scope, writes tests, commits locally |
| Verify Agent | `verify-agent.md` | Reviews changes for correctness, guideline compliance, and cleanup quality evidence |
| Scout Agent | `scout-agent.md` | Discovers, qualifies, and profiles businesses matching a campaign brief |
| Marketing Agent | `marketing-agent.md` | Executes marketing tasks via 25 specialized skills across 7 categories |

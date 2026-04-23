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
┌──────────┐     ┌────────────┐     ┌──────────┐
│  Scout   │     │ Marketing  │     │    KB    │
│  Agent   │     │  Agent     │     │  Agent   │
└──────────┘     └────────────┘     └──────────┘
 Lead gen &       CRO, SEO, copy,    Knowledge base
 prospecting      ads, strategy       maintenance
```

## Plan Agent

The Plan Agent analyzes the codebase and produces a structured implementation plan. It does not write code.

**Process:**

1. **Analyze** — Uses Glob, Grep, and Read to explore the project structure, tech stack, and relevant files, including in-scope simplification/dead-code opportunities. Posts an analysis summary as a comment.
2. **Clarify** — If the goal is ambiguous or there are meaningful design choices, asks the user one question at a time. Skips this step if requirements are clear.
3. **Write Plan** — Produces a structured plan: context, approach, ordered steps with file references (including cleanup/simplification and dead-code removal when applicable), files-to-modify table, and acceptance criteria with checkboxes.
4. **Deliver** — Posts the plan as a comment, writes it to the work item description (so Code Agent can read it), and signals completion.

**Tools:** Read, Glob, Grep, Bash, Write, Edit, Agent, WebSearch, WebFetch
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

**Tools:** Read, Glob, Grep, Bash, Write, Edit, Agent, WebSearch, WebFetch
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

## QA Agent

The QA Agent proactively finds bugs, code quality issues, and UX problems by running builds, tests, linters, performing code analysis, and visually exploring the UI via Playwright. It then lets the user triage findings and creates work items for approved issues.

**Process:**

1. **Discovery** — Runs `npm run build`, `npm test`, and linting. Scans for dead code, error handling gaps, type issues, security concerns, performance issues, and dependency problems.
2. **UI Exploration** — For web projects: starts the dev server, writes and runs a Playwright script to navigate pages, test workflows, capture screenshots at multiple breakpoints, and analyze visual issues. Skipped for non-web projects.
3. **Reporting** — Posts a structured findings report grouped by severity (Critical, High, Medium, Low) with file:line references and screenshot evidence.
4. **Triage** — Presents findings in batches of 4-6 via `ask_question` with "Skip all remaining" option.
5. **Creation** — Creates work items for approved findings with title prefixes: `(bug)` for code bugs, `(UX)` for UI issues, `(debt)` for code quality.
6. **Completion** — Posts a summary and signals completion.

**Tools:** Read, Glob, Grep, Bash, Write, Edit, Agent, WebSearch, WebFetch
**Model:** opus | **Timeout:** 60 min
**Definition:** [`src/agents/qa-agent.md`](../src/agents/qa-agent.md)

## BA Agent

The BA (Business Analysis) Agent finds **business logic bugs** — code that is syntactically correct and passes type checks but is semantically wrong. It analyzes state lifecycles, API contracts, and domain invariants to find logic errors that mechanical tools (linters, type checkers, QA builds) cannot catch. It is read-only and never modifies code.

**Analysis Framework:**

1. **State Lifecycle** — Invalid initial values, impossible state combinations, race conditions, stale closures, cleanup ordering.
2. **API Contract** — Unvalidated API assumptions, cumulative vs. incremental semantics, destructive operations without guards, error handling distinctions.
3. **Business Rule** — Disabled UI bypasses, validation inconsistencies, missing guard clauses, unsafe monetary calculations, timezone issues.
4. **Temporal Ordering** — Out-of-order events, optimistic update rollbacks, debounced handler losses, TOCTOU races, duplicate side effects.

**Process:**

1. **Domain Discovery** — Reads project docs, maps entities, APIs, and business rules.
2. **State Flow Analysis** — Traces state chains, effect dependencies, race conditions, and stale closures.
3. **API Contract Validation** — Reads all API integration code, checks idempotency, semantics, error handling, and pagination.
4. **Business Rule Audit** — Finds missing guards, validation inconsistencies, impossible states, and boundary condition gaps.
5. **Triage** — Presents findings in batches of 4-6 via `ask_question` with category, severity, location, and evidence.
6. **Creation & Completion** — Creates work items with `(logic)` prefix for approved findings and signals completion.

**Tools:** Read, Glob, Grep, Bash
**Model:** opus | **Timeout:** 30 min
**Definition:** [`src/agents/ba-agent.md`](../src/agents/ba-agent.md)

## Design Agent

The Design Agent executes frontend design tasks by routing to specialized impeccable skills. It covers 18 skills across 7 categories: Core Design System, Assessment, Visual Enhancement, Simplification, Refinement, Adaptation, and System Building.

**Skill Categories:**

| Category | Skills |
|----------|--------|
| **Core** | frontend-design |
| **Assessment** | audit, critique |
| **Visual Enhancement** | bolder, colorize, delight, animate |
| **Simplification** | distill, quieter, clarify |
| **Refinement** | polish, normalize, harden, optimize |
| **Adaptation** | adapt, onboard |
| **System Building** | extract |
| **Meta** | teach-impeccable |

**Process:**

1. **Identify Skill** — Reads the work item goal and matches it to the appropriate impeccable skill(s) via trigger keywords.
2. **Load Methodology** — Loads the full SKILL.md file from `/opt/design-skills/<skill-name>/SKILL.md` and internalizes the framework.
3. **Execute** — Applies the skill's methodology step by step, writing changes directly to project source files.
4. **Commit** — Stages and commits with conventional commit messages (local only, no push).
5. **Deliver** — Posts results as comments and signals completion.

**Tools:** Read, Glob, Grep, Bash, Write, Edit
**Model:** opus | **Timeout:** 60 min
**Definition:** [`src/agents/design-agent.md`](../src/agents/design-agent.md)

## KB Agent

The KB Agent builds and maintains a persistent, per-project knowledge base in `.yolium/kb/` by extracting knowledge from completed work items, conversation history, and the codebase itself. It is a write agent that creates and updates knowledge base pages — it does not implement features or fix bugs.

**Knowledge Base Structure:**
- **Index** (`_index.md`) — Manifest listing all KB pages with one-line summaries
- **Pages** — Markdown files with YAML frontmatter (title, category, sources, tags)
- **Categories** — architecture, patterns, conventions, bugs, dependencies, decisions
- **Cross-references** — `[[wikilinks]]` between pages for navigation

**Process:**

1. **Read Context** — Reviews the completed work item description, conversation history, and recent git diffs.
2. **Scan Codebase** — Uses Glob, Grep, and Read to understand the current state of relevant code.
3. **Extract Knowledge** — Identifies facts worth preserving: architecture decisions, patterns, conventions, bug causes, dependency notes.
4. **Create/Update Pages** — Writes new pages or updates existing ones in `.yolium/kb/` with complete YAML frontmatter and provenance tracking.
5. **Update Index** — Keeps `_index.md` in sync with all pages.
6. **Summarize** — Writes a `.yolium-kb-summary.md` file summarizing what was updated.

**Tools:** Read, Glob, Grep, Bash, Write, Edit
**Model:** sonnet | **Timeout:** 30 min
**Definition:** [`src/agents/kb-agent.md`](../src/agents/kb-agent.md)

## Agent Memory

Agents maintain conversational context across sessions through the comment thread on each work item.

When an agent starts (or resumes), Yolium calls `buildConversationHistory()` ([`yolium-db.ts:855`](../src/main/stores/yolium-db.ts#L855)) to collect all comments on the work item — from users, system events, and previous agent runs. This history is appended to the agent's prompt via `buildAgentPrompt()` ([`agent-runner.ts:56`](../src/main/services/agent-runner.ts#L56)) with the instruction "Continue from where you left off."

This means:
- A **Code Agent** can read the Plan Agent's analysis and implementation plan from the comment thread.
- A **Verify Agent** can see what the Code Agent claimed to have done and check it against actual changes.
- Any agent can be **resumed** after being paused (e.g., after answering a question) and it picks up with full context.

Agent output is also persisted to per-work-item log files via the workitem log store ([`workitem-log-store.ts`](../src/main/stores/workitem-log-store.ts)), providing a durable record of each agent's activity.

## Caveman Mode

Caveman Mode appends a terseness directive to an agent's system prompt to reduce output tokens. Inspired by [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman), it is implemented natively in Yolium — no external skill install required.

### Levels

| Mode | Token reduction target | Style |
|------|------------------------|-------|
| `off` | 0% (byte-identical to no directive) | Normal output |
| `lite` | ~25% | Short sentences, no filler |
| `full` | ~75% | Caveman grammar: drop articles, pronouns, auxiliaries |
| `ultra` | ~85% | Fragments only, bullet-style |

Every non-`off` level includes a preservation clause instructing the agent to keep code blocks, file paths, identifiers, and `@@YOLIUM:` JSON fully intact.

### Configuration

- **Per project** — `ProjectConfigDialog` exposes a radio group that writes `cavemanMode` to `.yolium.json`. Selecting `off` writes `"cavemanMode": "off"` explicitly (overwriting any previously stored level); projects that never opt in simply omit the key.
- **Per work item** — `NewItemDialog` and the item detail sidebar expose a dropdown with an `inherit` default that falls back to the project setting. A concrete item value (`off | lite | full | ultra`) overrides the project default.

### How It's Applied

When `startAgent` runs, [`resolveCavemanMode`](../src/main/services/caveman-mode.ts) picks the effective mode (item → project → `off`), and [`buildAgentPrompt`](../src/main/services/agent-prompts.ts) inserts the directive between the system prompt and the `## Current Goal` section on both the Claude and non-Claude prompt paths. The startup comment on the work item is annotated with `[caveman:<mode>]` when the mode is not `off` so the thread records which level was active for that run.

## Sub-Agents (Claude Code Only)

The Plan Agent and Code Agent can spawn **sub-agents** — parallel child processes that handle independent subtasks within a single agent run. This is Claude Code's built-in `Agent` tool, which launches specialized child processes inside the same Docker container.

### How It Works

When Claude Code's `Agent` tool is in the `--allowedTools` list, the agent can autonomously decide to delegate work to sub-agents. For example, a Code Agent might spawn sub-agents to:

- Research multiple parts of the codebase in parallel
- Run searches across different file patterns simultaneously
- Explore architectural questions without polluting the main context window

Sub-agents run as child processes of the main agent process, sharing the same container, filesystem, and git worktree. They report results back to the parent agent, which synthesizes them into its own work.

### Provider Support

| Provider | Sub-Agents? | Mechanism |
|----------|-------------|-----------|
| **Claude Code** | Yes | Built-in `Agent` tool spawns child processes. Enabled by including `Agent` in the agent definition's tools list. |
| **OpenCode** | No | No built-in sub-agent mechanism. Single-process execution only. |
| **Codex** | No | No built-in sub-agent mechanism. Single-process execution only. |

### Configuration

Sub-agents are enabled purely through the agent definition's YAML frontmatter — no Yolium infrastructure changes are needed. The existing pipeline (agent-loader parses tools from frontmatter -> agent-container-config passes them as `AGENT_TOOLS` env var -> agent.sh builds `--allowedTools` flag) handles the `Agent` tool like any other.

```yaml
tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Write
  - Edit
  - Agent        # Enables sub-agents (Claude Code only)
  - WebSearch
  - WebFetch
```

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
| QA Agent | `qa-agent.md` | Runs builds, tests, lints, code analysis, and Playwright UI exploration to find bugs |
| BA Agent | `ba-agent.md` | Finds business logic bugs via state lifecycle, API contract, and domain invariant analysis |
| Design Agent | `design-agent.md` | Executes frontend design tasks via 18 impeccable skills |
| Scout Agent | `scout-agent.md` | Discovers, qualifies, and profiles businesses matching a campaign brief |
| Marketing Agent | `marketing-agent.md` | Executes marketing tasks via 25 specialized skills across 7 categories |
| KB Agent | `kb-agent.md` | Builds and maintains per-project knowledge base from completed work |

# Yolium Agents

This directory contains agent definitions for Yolium's AI orchestration system.

## File Format

Each agent is a Markdown file with YAML frontmatter:

```markdown
---
name: agent-name
description: What this agent does
model: opus | sonnet | haiku
tools:
  - Read
  - Glob
  - Grep
  - WebSearch
---

# Agent Name

System prompt content here...
```

## Available Agents

| Agent | Provider | Purpose |
|-------|----------|---------|
| plan-agent | Claude, Codex, OpenCode | Analyzes codebase and produces implementation plans |
| code-agent | Claude, Codex, OpenCode | Implements code changes, writes tests, and commits locally |
| verify-agent | Claude, Codex, OpenCode | Reviews changes for correctness, over-engineering, and guideline compliance |

## Adding New Agents

1. Create `your-agent.md` in this directory
2. Add required frontmatter fields
3. Write the system prompt
4. The agent will be automatically discovered

## Files

- `plan-agent.md` - Plan Agent definition
- `code-agent.md` - Code Agent definition
- `verify-agent.md` - Verify Agent definition
- `_protocol.md` - Protocol reference (not loaded as agent)
- `README.md` - This file

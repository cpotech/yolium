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

| Agent | Model | Purpose |
|-------|-------|---------|
| plan-agent | opus | Decomposes goals into work items |

## Adding New Agents

1. Create `your-agent.md` in this directory
2. Add required frontmatter fields
3. Write the system prompt
4. The agent will be automatically discovered

## Files

- `plan-agent.md` - Plan Agent definition
- `_protocol.md` - Protocol reference (not loaded as agent)
- `README.md` - This file

<video src="https://github.com/user-attachments/assets/dcf55f73-33af-4c08-bb18-8c531fb96fc0" width="320" height="240" controls></video>
>Don't worry—the flickering is just the screen capture. Yolium runs smooth.

## Architecture

![Yolium Architecture](assets/architecture.svg)

- One image builds once → many containers spawn from it
- Containers are ephemeral (`--rm`) - deleted when session ends
- Agents can ONLY access explicitly mounted directories
- Package caches isolated per-project, credentials staged read-only per-session

## Agent Workflows

Yolium orchestrates three single-purpose agents in a **Plan → Code → Verify** pipeline:

| Agent | Role |
|-------|------|
| **Plan Agent** | Analyzes the codebase, asks clarifying questions, produces a structured implementation plan |
| **Code Agent** | Implements changes, writes tests, runs tests, commits to an isolated worktree branch |
| **Verify Agent** | Read-only reviewer: checks correctness, over-engineering, and guideline compliance |

Each agent runs in its own Docker container with an isolated git worktree — no conflicts, clean branches ready for PR.

> **[Agent Workflows documentation](docs/AGENTS.md)** — detailed process steps, the protocol, and how to create custom agents.

## Agent Memory

Agents see the full conversation history when resumed. Prior comments are fed back into the prompt, so an agent can pick up where it (or a previous agent) left off — enabling multi-session workflows across Plan → Code → Verify. See [Agent Memory](docs/AGENTS.md#agent-memory) for details.

## Extensibility

Each agent is a single Markdown file with YAML frontmatter and a system prompt, auto-discovered from `src/agents/`. Drop in a new `.md` file and it's immediately available — no code changes needed. See [Custom Agents](docs/AGENTS.md#custom-agents) for the schema and a walkthrough.

## Features

- **Kanban Board** - Built-in project board with Backlog, Ready, In Progress, and Done columns. Track work items, assign agents, and monitor progress — all persisted across sessions
- **Agent Orchestration** - Plan, Code, and Verify agents work autonomously: decompose goals into tasks, implement changes, run tests, commit branches, and review results — with interactive pauses when they need input
- **Parallel Agents** - Each agent gets its own git worktree and branch. Zero conflicts, clean branches ready for PR. ([details](docs/TECHNICAL.md#git-worktrees))
- **Multi-Tab Terminal** - Run multiple concurrent sessions with a tabbed interface
- **Docker Isolation** - Each session runs in its own container, isolated from your host
- **AI Agent Selection** - Claude Code, OpenCode, Codex, or interactive Shell
- **Git Integration** - Worktrees, configuration, and GitHub PAT support
- **Flexible Auth** - API keys or OAuth for Claude Code (Claude Max) and Codex (ChatGPT)
- **Pre-configured Environment** - Python, Node.js, Java, and common dev tools ready to use ([details](docs/TECHNICAL.md#container-environment))
- **Persistent Caches** - Package manager caches survive across sessions ([details](docs/TECHNICAL.md#file-mounts--cache))
- **Network Restrictions** - Only outbound HTTPS allowed
- **Cross-Platform** - Windows, macOS, and Linux

> **[Technical Documentation](docs/TECHNICAL.md)** - Detailed architecture, mount paths, and development guide

## Installation

**This project is in early development. Issues and feedback appreciated.**

### Prerequisites

**Docker** (platform-specific):
- **Windows**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) required
- **macOS**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [Colima](https://github.com/abiosoft/colima) *(currently untested)*
- **Linux**: [Docker Engine](https://docs.docker.com/engine/install/) only - no Desktop needed

### Downloads

Download the latest release from the [Releases page](https://github.com/yolium-ai/yolium/releases/latest):

| Platform | Package |
|----------|---------|
| Windows | `.exe` installer |
| Debian / Ubuntu | `.deb` |
| Fedora / RHEL | `.rpm` |
| Arch / Manjaro | `.pkg.tar.zst` |

> **[Full installation guide](docs/INSTALL.md)** -- step-by-step instructions, checksum verification, building from PKGBUILD, and troubleshooting.

### Quick Start

1. Download the latest release for your platform
2. Install and launch Yolium Desktop
3. On first run, Yolium will guide you through Docker setup if needed
4. Configure your Git settings (name, email, optional PAT, API keys or OAuth)
5. Click **+** to create a new session
6. Select a folder and choose your agent

## Development

See [docs/TECHNICAL.md](docs/TECHNICAL.md#development) for full tech stack, build instructions, and project structure.

```bash
git clone https://github.com/yolium-ai/yolium.git
cd yolium
npm install
npm start
```

## License

Licensed under the Yolium License Agreement. See [LICENSE](LICENSE) for details.

**Summary**: Free for local/organizational use as a development tool. Products you build must not redistribute Yolium. Reselling, hosting as a service, or commercial redistribution requires permission.

## Acknowledgments

- [AgentBox](https://github.com/fletchgqc/agentbox) - Inspiration for containerized agent environments
- [Electron](https://www.electronjs.org/) - Cross-platform desktop framework
- [xterm.js](https://xtermjs.org/) - Terminal emulation
- [Docker](https://www.docker.com/) - Container platform
- [Claude Code](https://claude.ai/) - AI coding assistant by Anthropic
- [OpenCode](https://github.com/opencode-ai/opencode) - Open-source AI agent

## Support

For issues and feature requests, please use the GitHub issue tracker.

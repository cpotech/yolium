> **⚠️ Yolium is under development.** We recommend keeping your app up to date. Issues and feedback are welcome — see [Feedback and Participation](#feedback-and-participation).

<img width="1892" height="1032" alt="image" src="https://github.com/user-attachments/assets/0aad7ee0-5aac-4335-927e-6485fd1f6889" />

## Architecture

![Yolium Architecture](assets/architecture.svg)

- One image builds once → many containers spawn from it
- Containers are ephemeral (`--rm`) - deleted when session ends
- Agents can ONLY access explicitly mounted directories
- Package caches isolated per-project, credentials staged read-only per-session

## Agent Workflows

Yolium orchestrates single-purpose agents in a **Plan → Code → Verify** pipeline for development, plus specialized agents for business intelligence and marketing:

| Agent | Role |
|-------|------|
| **Plan Agent** | Analyzes the codebase, asks clarifying questions, produces a structured implementation plan |
| **Code Agent** | Implements changes, writes tests, runs tests, commits to an isolated worktree branch |
| **Verify Agent** | Read-only reviewer: checks correctness, over-engineering, and guideline compliance |
| **QA Agent** | Proactive bug hunting: runs builds, tests, lints, code analysis, and Playwright UI exploration |
| **BA Agent** | Business logic analysis: finds semantic bugs in state lifecycles, API contracts, and domain invariants |
| **Design Agent** | Frontend design: executes 18 impeccable skills — audit, critique, polish, colorize, animate, and more |
| **Scout Agent** | Lead generation: discovers, qualifies, and profiles businesses matching a campaign brief |
| **Marketing Agent** | Executes marketing tasks via specialized skills — CRO, SEO, copywriting, ads, strategy |

Each agent runs in its own Docker container with an isolated git worktree — no conflicts, clean branches ready for PR.

> **[Agent Workflows documentation](docs/AGENTS.md)** — detailed process steps, the protocol, and how to create custom agents.

## Agent Memory

Agents see the full conversation history when resumed. Prior comments are fed back into the prompt, so an agent can pick up where it (or a previous agent) left off — enabling multi-session workflows across Plan → Code → Verify. See [Agent Memory](docs/AGENTS.md#agent-memory) for details.

## Scheduled Agents (CRON)

Yolium includes a built-in CRON scheduling system that runs agents autonomously on a schedule — no user interaction required. Define a **specialist** as a Markdown file, assign cron schedules, and Yolium handles execution, memory, cost tracking, and escalation.

- **Time-driven execution** — heartbeat (every 30 min), daily, weekly, or custom cron expressions
- **Built-in specialists** — security monitoring, codebase health checks, social media growth
- **Persistent memory** — agents see their recent run history and avoid repeating work
- **Cost controls** — per-run token/cost tracking, spike detection, automatic frequency reduction
- **Zero-code setup** — drop a `.md` file in `src/agents/cron/` and reload

| Specialist | Purpose |
|---|---|
| `security-monitor` | Scan for leaked secrets, audit dependencies, CVE reports |
| `codebase-health` | CI status, failing tests, technical debt tracking |
| `twitter-growth` | Engagement monitoring, content planning, performance audits |

> **[Scheduled Agents documentation](docs/CRON-AGENTS.md)** — full guide to creating specialists, cron expressions, memory strategies, escalation, cost estimation, and troubleshooting.

## Extensibility

Each agent is a single Markdown file with YAML frontmatter and a system prompt, auto-discovered from `src/agents/`. Drop in a new `.md` file and it's immediately available — no code changes needed. See [Custom Agents](docs/AGENTS.md#custom-agents) for the schema and a walkthrough.

## Features

- **Scheduled Agents (CRON)** - Run specialists autonomously on cron schedules with persistent memory, cost tracking, and adaptive escalation ([details](docs/CRON-AGENTS.md))
- **Kanban Board** - Built-in project board with Backlog, Ready, In Progress, and Done columns. Track work items, assign agents, and monitor progress — all persisted across sessions
- **Agent Orchestration** - Plan, Code, Verify, QA, BA, and Design agents work autonomously with interactive pauses when they need input
- **Parallel Agents** - Each agent gets its own git worktree and branch. Zero conflicts, clean branches ready for PR. ([details](docs/TECHNICAL.md#git-worktrees))
- **Multi-Tab Terminal** - Run multiple concurrent sessions with a tabbed interface
- **Docker Isolation** - Each session runs in its own container, isolated from your host
- **AI Agent Selection** - Claude Code, OpenCode, Codex, or interactive Shell
- **Git Integration** - Worktrees, configuration, GitHub PAT, and branch management
- **Flexible Auth** - API keys or OAuth for Claude Code (Claude Max) and Codex (ChatGPT)
- **Claude Usage Monitoring** - Track Claude Max subscription usage directly from the app
- **Vim Mode** - Vim-style keyboard navigation with leader-key shortcuts and WhichKey popup for discoverability
- **Project Onboarding** - Auto-detects project type (Node.js, Python, Rust, Go, Java, .NET) and generates appropriate `.gitignore` files
- **Project Configuration** - Per-project `.yolium.json` config for shared directories and agent settings
- **Code Review** - Git diff viewer for inspecting agent changes side-by-side
- **Test Report Viewer** - Opens HTML test reports in dedicated windows for easy review
- **Speech-to-Text** - Local Whisper models for voice input
- **Pre-configured Environment** - Python, Node.js, Java, and common dev tools ready to use ([details](docs/TECHNICAL.md#container-environment))
- **Persistent Caches** - Package manager caches survive across sessions ([details](docs/TECHNICAL.md#file-mounts--cache))
- **Network Restrictions** - Outbound limited to HTTPS, IMAPS, and SMTP only ([details](docs/TECHNICAL.md#network-restrictions))
- **Cross-Platform** - Windows, macOS, and Linux

> **[Technical Documentation](docs/TECHNICAL.md)** - Detailed architecture, mount paths, and development guide

## Installation

### Prerequisites

**Docker** (platform-specific):
- **Windows**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) required
- **macOS**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [Colima](https://github.com/abiosoft/colima) *(MacOS currently untested)*
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

## Feedback and Participation
We're excited to have you join us early in the Yolium journey.

This is an early-stage preview, and we're building quickly. Expect frequent updates--please keep your app up to date for the latest features and fixes!

Your insights are invaluable! Open issue in this repo, for ERs and bugs you want prioritised!

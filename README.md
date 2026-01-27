# Yolium  
:black_circle: ClaudeCode, :radio_button: OpenCode, :white_circle: Shell

:sparkles: A desktop app for running multiple autonomous AI agents in parallel — each safely containerized, with project-mounted workspaces and locked host access.

> Note: This project is in early development. Issues, feedback, and contributions are highly appreciated. :pray:

https://github.com/user-attachments/assets/7ed994f8-2c7e-40f3-95ea-2d391eba5ffd
---

Table of contents
- [Why Yolium?](#why-yolium)
- [Architecture](#architecture)
- [Features](#features)
- [Installation](#installation)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)
- [Support](#support)

---

## Why Yolium? :rocket:

Yolium provides an isolated, reproducible environment for running multiple AI agents concurrently. Each agent runs in its own ephemeral container and worktree, preventing cross-contamination while keeping development workflows (git, caches, tools) convenient and familiar.

Key goals:
- Strong isolation and safety for automated agents
- Reproducible sessions and clean Git branches per agent
- Fast developer feedback loop with pre-configured toolchains

---

## Architecture :gear:

![Yolium Architecture](assets/architecture.svg)

Design highlights:
- One base image built once → many ephemeral containers spawned
- Containers run with `--rm` and are deleted at session end
- Agents can access only explicitly mounted directories
- Per-project package caches are preserved across sessions while agent configs are shared globally

See [TECHNICAL.md](TECHNICAL.md) for a full, in-depth architecture and mount-path reference.

---

## Features :sparkles:

- :busts_in_silhouette: Parallel Agents — each agent receives its own Git worktree and branch (zero conflicts, clean branches ready for PR). See [TECHNICAL.md#git-worktrees](TECHNICAL.md#git-worktrees).
- :computer: Multi-Tab Terminal — run multiple concurrent sessions with a tabbed interface.
- :whale: Docker Isolation — each session runs in its own container, isolated from your host.
- :robot: AI Agent Selection — choose between Claude Code, OpenCode, or an interactive Shell.
- :package: Pre-configured Environment — Python, Node.js, Java, and common dev tools included. See [TECHNICAL.md#container-environment](TECHNICAL.md#container-environment).
- :floppy_disk: Persistent Caches — package manager caches survive across sessions to speed installs. See [TECHNICAL.md#file-mounts--cache](TECHNICAL.md#file-mounts--cache).
- :no_entry_sign: Network Restrictions — only outbound HTTPS and SSH allowed for agents.
- :earth_americas: Cross-Platform — supports Windows, macOS, and Linux.

---

## Installation :arrow_down:

This project is in early development. Use at your own risk and please open issues for bugs or feature requests.

### Prerequisites :clipboard:

- Docker
  - Windows: Docker Desktop required — https://www.docker.com/products/docker-desktop/
  - macOS: Docker Desktop or Colima (Colima currently untested) — https://github.com/abiosoft/colima
  - Linux: Docker Engine (no Docker Desktop required) — https://docs.docker.com/engine/install/

### Quick Start :rocket:

1. Download the latest release for your platform from the Releases page.
2. Install and launch Yolium Desktop.
3. On first run, Yolium will guide you through Docker setup (if needed).
4. Configure Git (name, email, optional GitHub PAT).
5. Click the **+** button to create a new session.
6. Select a folder and choose your agent.

Example (development build):
```bash
git clone https://github.com/yolium-ai/yolium.git
cd yolium
npm install
npm start
```

---

## Development :hammer_and_wrench:

See [TECHNICAL.md](TECHNICAL.md#development) for the full development guide, but here's a quick rundown:

- Install dependencies
  - npm (Node.js)
- Run locally
  - npm start
- Build production assets
  - npm run build
- Run tests (when available)
  - npm test

Project layout (high level):
- app/ — Electron frontend
- packages/ — shared libs and utilities
- docker/ — Dockerfile(s) and container config
- assets/ — static images, diagrams

---

## Contributing :handshake:

Contributions are welcome! :tada:

- Open an issue to discuss major changes or feature ideas.
- Fork the repo, create a feature branch, and send a pull request.
- Follow the existing code style and include tests where appropriate.
- Keep PRs focused and include a clear description of your change.

Please read any CONTRIBUTING.md if present for more details.

---

## License :page_with_curl:

Licensed under the Yolium License Agreement. See [LICENSE](LICENSE) for details.

Summary: Free for local/organizational use as a development tool. Products you build must not redistribute Yolium. Reselling, hosting as a service, or commercial redistribution requires permission.

---

## Acknowledgments :clap:

- [AgentBox](https://github.com/fletchgqc/agentbox) — inspiration for containerized agent environments
- [Electron](https://www.electronjs.org/) — cross-platform desktop framework
- [xterm.js](https://xtermjs.org/) — terminal emulation
- [Docker](https://www.docker.com/) — container platform
- [Claude Code](https://claude.ai/) — AI coding assistant by Anthropic
- [OpenCode](https://github.com/opencode-ai/opencode) — open-source AI agent

---

## Support :mailbox_with_mail:

For bugs, feature requests, or questions, please use the GitHub issue tracker: https://github.com/yolium-ai/yolium/issues

If you'd like to reach out directly, open an issue titled "Support Request" and we'll respond there.

---

Thank you for checking out Yolium! :heart:

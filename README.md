```
  ┌────────────────────────────────────────────────────┐
  │ ██╗   ██╗ ██████╗ ██╗     ██╗██╗   ██╗███╗   ███╗  │
  │ ╚██╗ ██╔╝██╔═══██╗██║     ██║██║   ██║████╗ ████║  │
  │  ╚████╔╝ ██║   ██║██║     ██║██║   ██║██╔████╔██║  │
  │   ╚██╔╝  ██║   ██║██║     ██║██║   ██║██║╚██╔╝██║  │
  │    ██║   ╚██████╔╝███████╗██║╚██████╔╝██║ ╚═╝ ██║  │
  │    ╚═╝    ╚═════╝ ╚══════╝╚═╝ ╚═════╝ ╚═╝     ╚═╝  │
  │                                                    │
  │        [■] ClaudeCode  [■] OpenCode  [■] Shell     │
  └────────────────────────────────────────────────────┘
A desktop app for running autonomous AI agents in parallel—each safely containerized.
Your solution is mounted in, everything else is locked out apart from persistent cache data.
```
> **[Technical Documentation](TECHNICAL.md)** - Detailed architecture, mount paths, and development guide

https://github.com/user-attachments/assets/7ed994f8-2c7e-40f3-95ea-2d391eba5ffd

## Architecture

![Yolium Architecture](assets/architecture.svg)

- One image builds once → many containers spawn from it
- Containers are ephemeral (`--rm`) - deleted when session ends
- Agents can ONLY access explicitly mounted directories
- Package caches isolated per-project, agent config shared globally

## Features

- **Parallel Agents** - Each agent gets its own git worktree and branch. Zero conflicts, clean branches ready for PR. ([details](TECHNICAL.md#git-worktrees))
- **Multi-Tab Terminal** - Run multiple concurrent sessions with a tabbed interface
- **Docker Isolation** - Each session runs in its own container, isolated from your host
- **AI Agent Selection** - Claude Code, OpenCode, or interactive Shell
- **Git Integration** - Worktrees, configuration, and GitHub PAT support
- **Pre-configured Environment** - Python, Node.js, Java, and common dev tools ready to use ([details](TECHNICAL.md#container-environment))
- **Persistent Caches** - Package manager caches survive across sessions ([details](TECHNICAL.md#file-mounts--cache))
- **Network Restrictions** - Only outbound HTTPS and SSH allowed
- **Cross-Platform** - Windows, macOS, and Linux

## Installation

**This project is in early development. Issues and feedback appreciated.**

### Prerequisites

**Docker** (platform-specific):
- **Windows**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) required
- **macOS**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [Colima](https://github.com/abiosoft/colima) *(currently untested)*
- **Linux**: [Docker Engine](https://docs.docker.com/engine/install/) only - no Desktop needed

### Quick Start

1. Download the latest release for your platform
2. Install and launch Yolium Desktop
3. On first run, Yolium will guide you through Docker setup if needed
4. Configure your Git settings (name, email, optional PAT)
5. Click **+** to create a new session
6. Select a folder and choose your agent

## Development

See [TECHNICAL.md](TECHNICAL.md#development) for full tech stack, build instructions, and project structure.

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

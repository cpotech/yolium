# Yolium Technical Documentation

This document contains detailed technical information about Yolium's architecture, configuration, and development.

## Table of Contents

- [Git Worktrees](#git-worktrees)
- [Container Environment](#container-environment)
- [File Mounts & Cache](#file-mounts--cache)
- [Development](#development)

---

## Git Worktrees

Multiple agents on one repo = file conflicts. Agent A edits `src/api.ts` while Agent B does too → race conditions, wasted tokens.

**Solution: Each agent gets its own worktree and branch.**

```
your-repo/                    # Main repository (shared .git)
/tmp/yolium-worktrees/
├── your-repo-abc123/         # Agent A: feature/auth
├── your-repo-def456/         # Agent B: fix/api-bug
└── your-repo-ghi789/         # Agent C: refactor/db
```

Each session creates a branch → provisions a worktree → mounts it in the container. Three agents work in parallel, zero conflicts, clean branches ready for PR.

---

## Cleanup Behavior

### What Gets Cleaned Up

When you close a tab, close the app, or use "Close All Tabs":

| Resource | Action | Notes |
|----------|--------|-------|
| **Docker Container** | Stopped and removed | The container instance is fully cleaned up |
| **Git Worktree** | Deleted | The worktree directory (`~/.yolium/worktrees/...`) is removed |

### What Persists

These resources remain across sessions:

| Resource | Location | Purpose |
|----------|----------|---------|
| **Docker Image** | `yolium:latest` | Rebuilt only when explicitly requested |
| **Project Caches** | `~/.cache/yolium/<project>/` | npm, pip, maven, gradle caches |
| **Shell History** | `~/.yolium/projects/<project>/history` | Command history per project |
| **Tool Configs** | `~/.claude`, `~/.config/opencode` | Claude Code and OpenCode settings |
| **Original Project** | Your project directory | Never modified by cleanup |

### Cleanup Timing

- **Tab Close**: UI closes instantly; container/worktree cleanup happens in background
- **Close All Tabs**: All tabs close instantly; cleanup runs in parallel for all sessions
- **App Close**: Cleanup completes before the app fully quits
- **App Crash**: Orphaned containers may remain (use Docker Desktop to clean up manually)

### Technical Details

The cleanup process:
1. Deletes the git worktree first (while session info is still available)
2. Stops the container with a 2-second grace period
3. Removes the container
4. Clears the session from memory

All cleanup operations are fire-and-forget from the UI perspective to ensure instant responsiveness.

---

## Container Environment

Every container is a complete, reproducible development environment. No setup scripts, no missing dependencies, no "works on my machine" problems.

### Languages & Runtimes

- Python 3 with pip
- Java (OpenJDK) with Maven and Gradle
- Node.js with npm

### Build Tools

- Make, CMake, build-essential
- Maven, Gradle (with persistent caches)

### Version Control

- Git with full configuration
- GitHub CLI (gh) - pre-authenticated via your PAT

### Developer Utilities

- Editors: vim, nano
- Terminal: tmux, htop
- Search: ripgrep (rg), fd-find
- Data: jq, yq, curl, wget

### Shell

zsh configured and ready

---

## File Mounts & Cache

### How Agents Access Your Files

The AI agent inside the container does **not** have direct access to your host filesystem. Yolium explicitly mounts only specific directories.

| Host Path | Container Path | Scope | Purpose |
|-----------|----------------|-------|---------|
| Your project folder | `/home/agent/<path>` | Per-session | The codebase the agent works on |
| `~/.cache/yolium/<project>/npm` | `/home/agent/.npm` | Per-project | npm package cache |
| `~/.cache/yolium/<project>/pip` | `/home/agent/.cache/pip` | Per-project | pip package cache |
| `~/.cache/yolium/<project>/maven` | `/home/agent/.m2` | Per-project | Maven repository cache |
| `~/.cache/yolium/<project>/gradle` | `/home/agent/.gradle` | Per-project | Gradle cache |
| `~/.yolium/projects/<project>/history` | `/home/agent/.yolium_history` | Per-project | Shell command history |
| `~/.claude` | `/home/agent/.claude` | Global | Claude Code settings & memory |
| `~/.config/opencode` | `/home/agent/.config/opencode` | Global | OpenCode configuration |
| `~/.local/share/opencode` | `/home/agent/.local/share/opencode` | Global | OpenCode data |
| `~/.yolium/ssh` | `/home/agent/.ssh` | Global | SSH keys (optional) |

**This is the only way the agent interacts with your host filesystem.** The agent cannot read your home directory, other projects, or system files - only the explicitly mounted paths above.

### Cache Retention Policy

Yolium tracks all project caches in a registry (`~/.yolium/project-registry.json`) with timestamps. Cache cleanup options:

- **Orphaned Caches**: When you delete a project folder from your system, its cache becomes "orphaned." These can be cleaned up to reclaim disk space.
- **Stale Caches**: Caches not accessed within 90 days (configurable) are considered stale and can be removed.
- **Manual Deletion**: Individual project caches can be deleted at any time.

Cache directories use readable names (e.g., `my-project-a1b2c3d4e5f6`) combining the folder name with a hash for easy identification.

---

## Development

### Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4
- **Desktop**: Electron 40 with Electron Forge
- **Terminal**: xterm.js with WebGL addon
- **Container**: Dockerode for Docker API integration
- **PTY**: node-pty for shell session management

### Building from Source

```bash
# Clone the repository
git clone https://github.com/yolium-ai/yolium.git
cd yolium

# Install dependencies
npm install

# Run in development mode
npm start

# Build for distribution
npm run make
```

### Project Structure

```
src/
├── main.ts              # Electron main process
├── App.tsx              # Main React component
├── components/          # React UI components
│   ├── TabBar.tsx       # Tab management
│   ├── Terminal.tsx     # xterm.js wrapper
│   ├── StatusBar.tsx    # Git status display
│   └── dialogs/         # Modal dialogs
├── lib/
│   ├── docker-manager.ts    # Container lifecycle
│   ├── pty-manager.ts       # Terminal sessions
│   └── git-worktree.ts      # Git integration
└── preload.ts           # Electron IPC bridge
```

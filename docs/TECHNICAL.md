# Yolium Technical Documentation

This document contains detailed technical information about Yolium's architecture, configuration, and development.

## Table of Contents

- [Git Worktrees](#git-worktrees)
- [Container Environment](#container-environment)
- [File Mounts & Cache](#file-mounts--cache)
  - [Network Restrictions](#network-restrictions)
- [Development](#development)

---

## Git Worktrees

Multiple agents on one repo = file conflicts. Agent A edits `src/api.ts` while Agent B does too → race conditions, wasted tokens.

**Solution: Each agent gets its own worktree and branch.**

```
your-repo/                    # Main repository (shared .git)
~/.yolium/worktrees/
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
| **Project Caches** | `~/.cache/yolium/<project>/` | npm, pip, maven, gradle, nuget caches |
| **Shell History** | `~/.yolium/projects/<project>/history` | Command history per project |
| **Host Credentials** | `~/.claude/.credentials.json`, `~/.codex/auth.json` | OAuth tokens (mounted read-only into containers when enabled) |
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

| Host Path | Container Path | Permission | Scope | Purpose |
|-----------|----------------|-----------|-------|---------|
| Your project folder | `/home/agent/<path>` | rw | Per-session | The codebase the agent works on |
| `~/.cache/yolium/<project>/npm` | `/home/agent/.npm` | rw | Per-project | npm package cache |
| `~/.cache/yolium/<project>/pip` | `/home/agent/.cache/pip` | rw | Per-project | pip package cache |
| `~/.cache/yolium/<project>/maven` | `/home/agent/.m2` | rw | Per-project | Maven repository cache |
| `~/.cache/yolium/<project>/gradle` | `/home/agent/.gradle` | rw | Per-project | Gradle cache |
| `~/.cache/yolium/<project>/nuget` | `/home/agent/.nuget` | rw | Per-project | NuGet package cache |
| `~/.yolium/projects/<project>/history` | `/home/agent/.yolium_history` | rw | Per-project | Shell command history |
| `<original-repo>/.git` | `<container-home>/<repo>/.git` | rw | Per-session | Git data (worktree mode only) |
| git-credentials | `/home/agent/.git-credentials-mounted` | ro | Global | GitHub PAT (staged, cleaned on exit) |
| `~/.claude/.credentials.json` | `/home/agent/.claude-credentials.json` | ro | Global | Claude OAuth token (staged, cleaned on exit) |
| `~/.codex/auth.json` | `/home/agent/.codex-auth.json` | ro | Global | Codex OAuth token (staged, cleaned on exit) |

**This is the only way the agent interacts with your host filesystem.** The agent cannot read your home directory, other projects, or system files - only the explicitly mounted paths above.

### Authentication Methods

Yolium supports two authentication methods for Claude Code agents:

| Method | How It Works | When to Use |
|--------|-------------|-------------|
| **Anthropic API Key** | Passed as `ANTHROPIC_API_KEY` env var to the container | Pay-per-token API usage |
| **Claude Max OAuth** | `~/.claude/.credentials.json` mounted read-only, copied into a minimal `~/.claude` directory inside container with `CLAUDE_CONFIG_DIR` set | Claude Max subscription ($100/mo) |

These are mutually exclusive -- toggling OAuth on in Settings clears the API key, and vice versa. Only the credentials file is mounted (not the entire `~/.claude` directory): mounted read-only at `/home/agent/.claude-credentials.json`, copied to `/home/agent/.claude/.credentials.json` with restricted permissions (directory: 700, file: 600), and cleaned up on container exit.

Yolium supports two authentication methods for Codex agents:

| Method | How It Works | When to Use |
|--------|-------------|-------------|
| **OpenAI API Key** | Passed as `OPENAI_API_KEY` env var to the container | Pay-per-token API usage |
| **Codex OAuth (ChatGPT)** | `~/.codex/auth.json` mounted read-only, copied into `~/.codex/auth.json` inside container | ChatGPT subscription login via `codex login` |

These are mutually exclusive -- toggling OAuth on in Settings clears the API key, and vice versa. Only `auth.json` is mounted (not the entire `~/.codex` directory): mounted read-only at `/home/agent/.codex-auth.json`, copied to `/home/agent/.codex/auth.json` with restricted permissions (directory: 700, file: 600), and cleaned up on container exit.

### Network Restrictions

Containers enforce outbound network restrictions via iptables (requires Docker `NET_ADMIN` capability). Only essential ports are allowed — everything else is dropped.

| Port | Protocol | Purpose |
|------|----------|---------|
| 53 | TCP/UDP | DNS resolution |
| 443 | TCP | HTTPS — APIs, package registries, git |
| 587 | TCP | SMTP submission (STARTTLS) — email sending |
| 993 | TCP | IMAPS — secure email fetching |

Localhost and established/related connections are always allowed.

**Disabling restrictions:** Set `YOLIUM_NETWORK_FULL=true` as an environment variable to allow all outbound traffic. This is useful for projects that need access to non-standard ports but reduces container isolation.

**Implementation:** `src/docker/entrypoint.d/10-network.sh` applies iptables rules at container startup. If iptables or NET_ADMIN capability is unavailable, restrictions are skipped gracefully.

### Cache Retention Policy

Yolium tracks all project caches in the SQLite database (`~/.yolium/yolium.db`, `project_registry` table) with timestamps. Cache cleanup options:

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
- **Database**: better-sqlite3 (SQLite) for kanban boards, project registry, schedules, and credentials
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

### Distribution Packages

`npm run make` produces platform-specific packages via Electron Forge:

| Platform | Format | Output Path |
|----------|--------|-------------|
| Windows | Squirrel installer (`.exe`) | `out/make/squirrel.windows/x64/` |
| Linux | Debian (`.deb`) | `out/make/deb/x64/` |
| Linux | RPM (`.rpm`) | `out/make/rpm/x64/` |
| Linux | Arch (`.pkg.tar.zst`) | `out/make/arch/x64/` |

### Building the Arch Linux Package

The Arch package is built separately from `electron-forge make` since it uses a `PKGBUILD` template (`build/PKGBUILD`) that packages the already-built Electron app.

**CI pipeline** (how it works in GitHub Actions):

1. `npm run make` builds the Electron app and produces the `out/Yolium Desktop-linux-x64/` directory
2. The app directory is tarred into a source archive for `makepkg`
3. The desktop entry (`build/yolium-desktop.desktop`) and icon are copied alongside the archive
4. The `PKGBUILD` version placeholder (`__VERSION__`) is replaced with the version from `package.json`
5. `makepkg` runs inside an `archlinux:base-devel` Docker container with `--nodeps` (runtime dependencies aren't needed at build time)

**Local build** (on an Arch-based system):

```bash
npm run make
VERSION=$(node -p "require('./package.json').version")
mkdir -p arch-pkg
tar czf "arch-pkg/yolium-desktop-${VERSION}.tar.gz" -C out "Yolium Desktop-linux-x64"
cp build/yolium-desktop.desktop arch-pkg/
cp assets/icon/web-app-manifest-512x512.png arch-pkg/yolium-desktop.png
sed "s/__VERSION__/${VERSION}/" build/PKGBUILD > arch-pkg/PKGBUILD
cd arch-pkg
makepkg -si
```

The resulting package installs to `/opt/yolium-desktop` with a symlink at `/usr/bin/yolium-desktop`, a `.desktop` entry in `/usr/share/applications/`, and an icon in `/usr/share/pixmaps/`.

### Project Structure

```
src/
├── main.ts                  # Electron main process entry
├── preload.ts               # IPC bridge
├── main/                    # Main process code
│   ├── ipc/                 # IPC handlers (namespaced)
│   ├── services/            # Agent runner, scheduler, etc.
│   ├── stores/              # SQLite (yolium-db), session, logs
│   ├── docker/              # Container lifecycle, image builder
│   ├── git/                 # Worktree, config, credentials
│   └── lib/                 # Logger, utilities
├── renderer/                # React UI
│   ├── main.tsx             # React entry point
│   ├── App.tsx              # Root component
│   ├── components/          # UI components by feature
│   ├── hooks/               # Custom React hooks
│   └── theme/               # Theme provider and tokens
└── shared/                  # Types shared across processes
    └── types/
```

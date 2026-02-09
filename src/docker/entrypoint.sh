#!/bin/bash

set -e

# Diagnostic logging for debugging container startup
# Set YOLIUM_LOG_LEVEL=debug to see these logs in terminal
LOGFILE="/tmp/yolium-entrypoint.log"
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOGFILE"
    [ "${YOLIUM_LOG_LEVEL:-}" = "debug" ] && echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" || true
}

# Log startup info
log "=== Yolium entrypoint starting ==="
log "TOOL=$TOOL"
log "PROJECT_DIR=$PROJECT_DIR"
log "Args: $@"

# Collect status messages to display after banner
STATUS_MESSAGES=""
add_status() {
    STATUS_MESSAGES="${STATUS_MESSAGES}${1}\n"
}

# Setup network restrictions (HTTPS, DNS only)
# Requires NET_ADMIN capability. Gracefully skips if unavailable.
setup_network_restrictions() {
    # Skip if user opts out
    if [ "${YOLIUM_NETWORK_FULL:-}" = "true" ]; then
        add_status "⚠️  Network restrictions disabled (YOLIUM_NETWORK_FULL=true)"
        return 0
    fi

    # Check if iptables is available
    if ! command -v iptables >/dev/null 2>&1; then
        add_status "⚠️  iptables not available, network restrictions not applied"
        return 0
    fi

    # Try to apply rules (will fail silently without NET_ADMIN)
    if ! sudo iptables -L OUTPUT -n >/dev/null 2>&1; then
        add_status "⚠️  NET_ADMIN capability not available, network restrictions not applied"
        return 0
    fi

    # Allow localhost (required for OpenCode internal server)
    sudo iptables -A OUTPUT -o lo -j ACCEPT

    # Allow established/related connections (responses to allowed requests)
    sudo iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

    # Allow DNS (UDP and TCP port 53)
    sudo iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
    sudo iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

    # Allow HTTPS (port 443) - APIs, package registries, HTTPS git
    sudo iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT

    # Drop everything else
    sudo iptables -A OUTPUT -j DROP

    add_status "🔒 Network restrictions applied (HTTPS/DNS only)"
}

# Apply network restrictions if available
log "Setting up network restrictions..."
setup_network_restrictions
log "Network restrictions setup complete"

# Create symlink from host home path to container home for path compatibility
# This fixes hardcoded paths in ~/.claude config files (e.g., known_marketplaces.json)
if [ -n "$HOST_HOME" ] && [ "$HOST_HOME" != "$HOME" ] && [ ! -e "$HOST_HOME" ]; then
    log "Creating symlink for host home path compatibility: $HOST_HOME -> $HOME"
    sudo ln -sf "$HOME" "$HOST_HOME" 2>/dev/null && \
        add_status "✅ Host path compatibility symlink created"
fi

# API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY) are passed as environment variables
# by Yolium — no host config directories are mounted into the container.

# For worktrees: fix the .git file to point to Linux-mounted path
# The worktree's .git file references Windows path (e.g., gitdir: C:/Users/.../worktrees/name)
# We mount .git at /c/Users/..., so update the .git file to use Linux path
if [ -n "$WORKTREE_REPO_PATH" ] && [ -n "$PROJECT_DIR" ]; then
    GITFILE="$PROJECT_DIR/.git"
    if [ -f "$GITFILE" ]; then
        # Read current content and convert Windows path to Linux-style
        # C:/Users/... -> /c/Users/...
        CURRENT=$(cat "$GITFILE")
        FIXED=$(echo "$CURRENT" | sed 's|gitdir: \([A-Za-z]\):|gitdir: /\L\1|')
        if [ "$CURRENT" != "$FIXED" ]; then
            log "Fixing worktree .git file path: Windows -> Linux style"
            echo "$FIXED" > "$GITFILE"
            add_status "✅ Worktree git path fixed"
        fi
    fi
fi

export PATH="$HOME/.local/bin:$PATH"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
    log "Sourcing NVM..."
    export NVM_DIR="$HOME/.nvm"
    source "$NVM_DIR/nvm.sh"
    log "NVM sourced successfully"
fi

if [ -f "$HOME/.sdkman/bin/sdkman-init.sh" ]; then
    log "Sourcing SDKMAN..."
    source "$HOME/.sdkman/bin/sdkman-init.sh"
    log "SDKMAN sourced successfully"
fi

if [ -d "$HOME/.dotnet" ]; then
    log "Configuring .NET SDK..."
    export DOTNET_ROOT="$HOME/.dotnet"
    export PATH="$DOTNET_ROOT:$DOTNET_ROOT/tools:$PATH"
    export DOTNET_CLI_TELEMETRY_OPTOUT=1
    export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
    log ".NET SDK configured"
fi

if [ -n "$PROJECT_DIR" ] && [ ! -d "$PROJECT_DIR/.venv" ] && [ -f "$PROJECT_DIR/requirements.txt" -o -f "$PROJECT_DIR/pyproject.toml" -o -f "$PROJECT_DIR/setup.py" ]; then
    cd "$PROJECT_DIR"
    uv venv .venv 2>/dev/null
    add_status "✅ Virtual environment created at .venv/"
fi

# Auto-restore .NET packages if a .NET project is detected
if [ -n "$PROJECT_DIR" ] && [ -d "$HOME/.dotnet" ]; then
    if ls "$PROJECT_DIR"/*.sln "$PROJECT_DIR"/*.csproj "$PROJECT_DIR"/*.fsproj 2>/dev/null | head -1 >/dev/null 2>&1; then
        export DOTNET_ROOT="$HOME/.dotnet"
        export PATH="$DOTNET_ROOT:$DOTNET_ROOT/tools:$PATH"
        cd "$PROJECT_DIR"
        dotnet restore --verbosity quiet >/dev/null 2>&1 && \
            add_status "✅ .NET packages restored"
    fi
fi

if [ -d "/tmp/host_direnv_allow" ]; then
    mkdir -p /home/agent/.local/share/direnv/allow
    cp /tmp/host_direnv_allow/* /home/agent/.local/share/direnv/allow/ 2>/dev/null && \
        add_status "✅ Direnv approvals copied from host"
fi

# Git config priority: env vars > host gitconfig > defaults
if [ -n "$GIT_USER_NAME" ] && [ -n "$GIT_USER_EMAIL" ]; then
    cat > /home/agent/.gitconfig << EOF
[user]
    email = $GIT_USER_EMAIL
    name = $GIT_USER_NAME
[init]
    defaultBranch = main
EOF
    add_status "✅ Using git identity: $GIT_USER_NAME <$GIT_USER_EMAIL>"
elif [ -f "/tmp/host_gitconfig" ]; then
    cp /tmp/host_gitconfig /home/agent/.gitconfig
else
    cat > /home/agent/.gitconfig << 'EOF'
[user]
    email = agent@yolium
    name = AI Agent (Yolium)
[init]
    defaultBranch = main
EOF
    add_status "ℹ️  Using default git identity (agent@yolium). Configure via Settings gear."
fi

# Mark the project directory as safe for git (fixes ownership mismatch with mounted volumes)
if [ -n "$PROJECT_DIR" ]; then
    git config --global --add safe.directory "$PROJECT_DIR"
fi

# Cleanup function for EXIT trap (handles git-credentials and OAuth cleanup)
cleanup() {
    rm -f /tmp/.git-credentials
    rm -rf /home/agent/.claude
    rm -rf /home/agent/.codex
    # Note: bind-mounted files (.claude-credentials.json, .codex-auth.json) cannot be removed;
    # the actual credentials copies live under ~/.claude/ and ~/.codex/ (cleaned above).
}
trap cleanup EXIT

# Configure git credential helper if git-credentials file is mounted
# Git credentials are bind-mounted read-only at a staging path.
# Copy to a local writable location so git credential store can create lock files.
# Using /tmp avoids issues with bind-mounted home directory overlaps.
if [ -f "/home/agent/.git-credentials-mounted" ]; then
    GIT_CRED_FILE="/tmp/.git-credentials"
    cp /home/agent/.git-credentials-mounted "$GIT_CRED_FILE"
    chmod 600 "$GIT_CRED_FILE"
    git config --global credential.helper "store --file=\"$GIT_CRED_FILE\""
    add_status "✅ GitHub HTTPS credentials configured"

    # Authenticate gh CLI using stored credentials
    if command -v gh >/dev/null 2>&1; then
        # Extract token from git-credentials (supports github_pat_* and ghp_* formats)
        GH_TOKEN=$(grep 'github.com' "$GIT_CRED_FILE" 2>/dev/null | sed 's/.*:\(github_pat_[^@]*\|ghp_[^@]*\)@.*/\1/')
        if [ -n "$GH_TOKEN" ]; then
            echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null && \
                add_status "✅ GitHub CLI (gh) authenticated"
        fi
        unset GH_TOKEN
    fi
    unset GIT_CRED_FILE
fi

# Configure Claude OAuth if credentials file is mounted and enabled
# Only the credentials file is bind-mounted read-only (not the entire ~/.claude directory).
# Create a minimal ~/.claude directory and copy just the credentials file into it.
if [ -f "/home/agent/.claude-credentials.json" ] && [ "${CLAUDE_OAUTH_ENABLED:-}" = "true" ]; then
    log "Setting up Claude OAuth credentials..."
    mkdir -p /home/agent/.claude
    chmod 700 /home/agent/.claude
    cp /home/agent/.claude-credentials.json /home/agent/.claude/.credentials.json
    chmod 600 /home/agent/.claude/.credentials.json
    export CLAUDE_CONFIG_DIR="/home/agent/.claude"
    add_status "✅ Claude OAuth credentials configured"
    log "Claude OAuth credentials staged at /home/agent/.claude/.credentials.json"
fi

# Configure Codex OAuth if credentials file is mounted and enabled
# Only the auth.json file is bind-mounted read-only (not the entire ~/.codex directory).
# Create a minimal ~/.codex directory and copy just the auth file into it.
if [ -f "/home/agent/.codex-auth.json" ] && [ "${CODEX_OAUTH_ENABLED:-}" = "true" ]; then
    log "Setting up Codex OAuth credentials..."
    mkdir -p /home/agent/.codex
    chmod 700 /home/agent/.codex
    cp /home/agent/.codex-auth.json /home/agent/.codex/auth.json
    chmod 600 /home/agent/.codex/auth.json
    add_status "✅ Codex OAuth credentials configured"
    log "Codex OAuth credentials staged at /home/agent/.codex/auth.json"
fi

# Create CLAUDE.md with Yolium container environment info
cat > /home/agent/CLAUDE.md << 'CLAUDEMD'
# Yolium Container Environment

You are running inside a Yolium container - an isolated Docker environment for AI coding agents.

## Git Access

If GitHub PAT was configured in Yolium settings:
- Git HTTPS operations work automatically (push, pull, clone)
- `gh` CLI is pre-authenticated - use it for GitHub operations (PRs, issues, etc.)
- Credentials are at `/home/agent/.git-credentials`

Check authentication status:
```bash
gh auth status
```

If `gh` is not authenticated but git credentials exist, authenticate manually:
```bash
grep 'github.com' /home/agent/.git-credentials | sed 's/.*:\(github_pat_[^@]*\|ghp_[^@]*\)@.*/\1/' | gh auth login --with-token
```

## Authentication

API keys are passed as environment variables by Yolium (configured in Settings):
- `ANTHROPIC_API_KEY` - Used by Claude Code and OpenCode
- `OPENAI_API_KEY` - Used by Codex CLI

Alternatively, Claude Code can use **Claude Max OAuth** tokens (enable in Settings).
When OAuth is enabled, only `~/.claude/.credentials.json` is mounted and staged into the container.

No other host config directories (e.g., `~/.codex`) are mounted into the container.

## Environment

- **Project directory**: Mounted at the path shown in the Yolium banner
- **Persistent caches**: npm, pip, maven, gradle, nuget caches persist across sessions
- **Languages**: Python (uv), Node.js (nvm), Java (SDKMAN), .NET (dotnet)
- **Network**: Restricted to HTTPS, DNS only (unless YOLIUM_NETWORK_FULL=true)

## Important Paths

- `/home/agent/.git-credentials` - GitHub PAT (if configured)
- `/home/agent/.yolium_history` - Shell history (persistent)

## Testing Limitations

**Do NOT run E2E tests inside this container.** E2E tests (`npm run test:e2e`) require Electron and a display server, which are not available in the container environment. Only run unit tests (`npm test`) here.
CLAUDEMD

if [ -n "$PROJECT_DIR" ] && { [ -f "$PROJECT_DIR/.mcp.json" ] || [ -f "$PROJECT_DIR/mcp.json" ]; }; then
    add_status "🔌 MCP configuration detected. To enable MCP servers, see Yolium documentation."
fi

export TERM=xterm-256color

# Handle terminal size
if [ -t 0 ]; then
    eval $(resize 2>/dev/null || true)
fi

if [ -t 0 ] && [ -t 1 ]; then
    cat << 'BANNER'

██╗   ██╗ ██████╗ ██╗     ██╗██╗   ██╗███╗   ███╗
╚██╗ ██╔╝██╔═══██╗██║     ██║██║   ██║████╗ ████║
 ╚████╔╝ ██║   ██║██║     ██║██║   ██║██╔████╔██║
  ╚██╔╝  ██║   ██║██║     ██║██║   ██║██║╚██╔╝██║
   ██║   ╚██████╔╝███████╗██║╚██████╔╝██║ ╚═╝ ██║
   ╚═╝    ╚═════╝ ╚══════╝╚═╝ ╚═════╝ ╚═╝     ╚═╝
  Sandboxed Environments for running parallel AI Agents

BANNER
    echo "📂 Mounted: ${PROJECT_DIR:-unknown}"
    if [ -n "$EXTRA_DIRS" ]; then
        for dir in $EXTRA_DIRS; do
            echo "           $dir"
        done
    fi
    echo ""
    echo "💾 Persistent data (survives container removal):"
    echo "   ~/.npm               → npm cache"
    echo "   ~/.cache/pip         → pip cache"
    echo "   ~/.m2                → Maven cache"
    echo "   ~/.gradle            → Gradle cache"
    echo "   ~/.nuget             → NuGet cache"
    echo "   ~/.yolium_history    → Shell command history"
    echo ""
    echo "🐍 Python: $(python3 --version 2>&1 | cut -d' ' -f2) (uv available)"
    echo "🟢 Node.js: $(node --version 2>/dev/null || echo 'not found')"
    echo "☕ Java: $(java -version 2>&1 | head -1 | cut -d'"' -f2 || echo 'not found')"
    echo "🔷 .NET: $(DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1 dotnet --version 2>/dev/null || echo 'not found')"
    if [ "$TOOL" = "opencode" ]; then
        echo "🤖 OpenCode: $(opencode --version 2>/dev/null || echo 'not found - check installation')"
    elif [ "$TOOL" = "codex" ]; then
        echo "🤖 Codex CLI: $(codex --version 2>/dev/null || echo 'not found - check installation')"
    else
        echo "🤖 Claude CLI: $(claude --version 2>/dev/null || echo 'not found - check installation')"
    fi
    echo ""
    if [ -n "$STATUS_MESSAGES" ]; then
        echo -e "$STATUS_MESSAGES"
    fi
fi

# Diagnostic logging before exec
log "=== Pre-exec diagnostics ==="
log "TOOL=$TOOL"
log "GSD_ENABLED=${GSD_ENABLED:-not set}"
log "Args passed: $@"
log "PATH=$PATH"
log "which opencode: $(which opencode 2>&1 || echo 'not found')"
log "which claude: $(which claude 2>&1 || echo 'not found')"
log "which codex: $(which codex 2>&1 || echo 'not found')"
log "TTY status: $(tty 2>&1 || echo 'no tty')"
log "=== Starting exec ==="

# Build command based on TOOL environment variable
# This is more robust than relying on Cmd array which can be corrupted by bundling
# NVM is already sourced above, so we can exec tools directly
if [ "$TOOL" = "shell" ]; then
    log "Starting shell mode"
    exec zsh
elif [ "$TOOL" = "code-review" ]; then
    log "Starting code review mode"
    log "REVIEW_REPO_URL=$REVIEW_REPO_URL"
    log "REVIEW_BRANCH=$REVIEW_BRANCH"
    log "REVIEW_AGENT=$REVIEW_AGENT"

    # Clone the repository
    echo "Cloning repository: $REVIEW_REPO_URL"
    if ! git clone --depth 50 --branch "$REVIEW_BRANCH" "$REVIEW_REPO_URL" "$PROJECT_DIR/repo" 2>&1; then
        echo "ERROR: Failed to clone repository"
        exit 1
    fi
    cd "$PROJECT_DIR/repo"
    git config --global --add safe.directory "$PROJECT_DIR/repo"

    echo "Checked out branch: $REVIEW_BRANCH"

    # Verify GitHub authentication before querying PRs
    if ! gh auth status >/dev/null 2>&1; then
        echo "ERROR: GitHub CLI is not authenticated. Configure a PAT in Yolium settings."
        exit 3
    fi

    # Check if a PR exists for this branch
    echo "Checking for open PR on branch $REVIEW_BRANCH..."
    PR_OUTPUT=$(gh pr list --head "$REVIEW_BRANCH" --state open --json number --jq '.[0].number' 2>&1)
    PR_EXIT=$?
    if [ $PR_EXIT -ne 0 ]; then
        echo "ERROR: Failed to query GitHub PRs: $PR_OUTPUT"
        exit 3
    fi
    PR_NUMBER="$PR_OUTPUT"
    if [ -z "$PR_NUMBER" ]; then
        echo "ERROR: No open PR found for branch '$REVIEW_BRANCH'. Please create a PR first."
        exit 2
    fi
    echo "Found PR #$PR_NUMBER"

    echo "Starting code review with $REVIEW_AGENT..."

    # Map agent to display name
    case "$REVIEW_AGENT" in
        claude)  AGENT_DISPLAY="Claude Code" ;;
        opencode) AGENT_DISPLAY="OpenCode" ;;
        codex)   AGENT_DISPLAY="Codex CLI" ;;
        *)       AGENT_DISPLAY="$REVIEW_AGENT" ;;
    esac

    # Build the review prompt
    REVIEW_PROMPT="You are an expert code reviewer. Review the code changes on this branch thoroughly.

Look at the git log and diff to understand all changes:
1. Run: git log --oneline -20
2. Run: git diff origin/HEAD...HEAD (or git diff main...HEAD if that fails)

Review the changes for:
- Bugs, logic errors, edge cases
- Security vulnerabilities (injection, XSS, auth issues)
- Performance concerns
- Code style, readability, maintainability
- Missing error handling
- Test coverage gaps

After reviewing, post your review as a PR comment using:
  gh pr comment $PR_NUMBER --body '<your review>'

IMPORTANT: At the very end of your review comment, include this footer on its own line:
---
*Reviewed by $AGENT_DISPLAY via [Yolium](https://github.com/yolium-ai/yolium)*

Be thorough but constructive. Focus on substantive issues, not nitpicks."

    if [ "$REVIEW_AGENT" = "claude" ]; then
        log "Running Claude for code review"
        if [ -z "$ANTHROPIC_API_KEY" ] && [ ! -f "$HOME/.claude/.credentials.json" ]; then
            echo "ERROR: No Anthropic authentication found. Add an API Key or enable Claude Max OAuth in Yolium Settings."
            exit 3
        fi
        claude --dangerously-skip-permissions -p "$REVIEW_PROMPT"
        exit $?
    elif [ "$REVIEW_AGENT" = "opencode" ]; then
        log "Running OpenCode for code review"
        # If no API key, fall back to OpenCode's free model
        if [ -z "$ANTHROPIC_API_KEY" ]; then
            log "No ANTHROPIC_API_KEY set, using free model opencode/big-pickle"
            opencode run -m opencode/big-pickle "$REVIEW_PROMPT"
            exit $?
        fi
        opencode run "$REVIEW_PROMPT"
        exit $?
    elif [ "$REVIEW_AGENT" = "codex" ]; then
        log "Running Codex for code review"
        if [ -z "$OPENAI_API_KEY" ] && [ ! -f "$HOME/.codex/auth.json" ]; then
            echo "ERROR: No Codex authentication found."
            echo "Add your OpenAI API Key or enable Codex OAuth (ChatGPT) in Yolium Settings."
            exit 3
        fi
        # Use danger-full-access sandbox — Codex's Landlock sandbox panics on
        # kernels where Landlock is compiled but not functional.
        # Docker already provides container-level isolation.
        # See: https://github.com/openai/codex/issues/2267
        codex exec --sandbox danger-full-access "$REVIEW_PROMPT"
        exit $?
    else
        echo "ERROR: Unknown review agent: $REVIEW_AGENT"
        exit 1
    fi
elif [ "$TOOL" = "agent" ]; then
    log "Starting agent mode"
    log "AGENT_MODEL=$AGENT_MODEL"
    log "AGENT_TOOLS=$AGENT_TOOLS"

    # Validate required environment variables
    if [ -z "$AGENT_PROMPT" ]; then
        echo "ERROR: AGENT_PROMPT environment variable is required"
        exit 1
    fi

    if [ -z "$AGENT_MODEL" ]; then
        echo "ERROR: AGENT_MODEL environment variable is required"
        exit 1
    fi

    # Decode base64 prompt
    PROMPT=$(echo "$AGENT_PROMPT" | base64 -d)
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to decode AGENT_PROMPT (invalid base64)"
        exit 1
    fi

    log "Prompt decoded successfully (length: ${#PROMPT})"

    # Map model name to full model ID
    case "$AGENT_MODEL" in
        opus)   MODEL_ID="claude-opus-4-6" ;;
        sonnet) MODEL_ID="claude-sonnet-4-5-20250929" ;;
        haiku)  MODEL_ID="claude-haiku-4-5-20251001" ;;
        *)      MODEL_ID="$AGENT_MODEL" ;;
    esac

    # Build allowed tools argument
    TOOLS_ARG=""
    if [ -n "$AGENT_TOOLS" ]; then
        TOOLS_ARG="--allowedTools $AGENT_TOOLS"
    fi

    log "Running agent: provider=$AGENT_PROVIDER model=$MODEL_ID tools=$AGENT_TOOLS"

    # Determine which agent to run based on AGENT_PROVIDER
    AGENT_PROV="${AGENT_PROVIDER:-claude}"
    log "Agent provider: $AGENT_PROV"

    if [ "$AGENT_PROV" = "opencode" ]; then
        log "Starting OpenCode headless agent mode"
        # If no API key, fall back to OpenCode's free model
        if [ -z "$ANTHROPIC_API_KEY" ]; then
            log "No ANTHROPIC_API_KEY set, using free model opencode/big-pickle"
            opencode run -m opencode/big-pickle "$PROMPT"
            exit $?
        fi
        opencode run "$PROMPT"
        exit $?
    elif [ "$AGENT_PROV" = "codex" ]; then
        log "Starting Codex headless agent mode"
        if [ -z "$OPENAI_API_KEY" ] && [ ! -f "$HOME/.codex/auth.json" ]; then
            echo "ERROR: No Codex authentication found."
            echo "Add your OpenAI API Key or enable Codex OAuth (ChatGPT) in Yolium Settings."
            exit 3
        fi
        # Use danger-full-access sandbox — Codex's Landlock sandbox panics on
        # kernels where Landlock is compiled but not functional.
        # Docker already provides container-level isolation.
        codex exec --sandbox danger-full-access "$PROMPT"
        exit $?
    else
        log "Starting Claude Code agent"
        if [ -z "$ANTHROPIC_API_KEY" ] && [ ! -f "$HOME/.claude/.credentials.json" ]; then
            echo "ERROR: No Anthropic authentication found. Add an API Key or enable Claude Max OAuth in Yolium Settings."
            exit 3
        fi
        # Run Claude with stream-json output format so events are streamed incrementally.
        # Without this, -p mode buffers all output until completion (no streaming).
        # --verbose is required when combining -p with --output-format stream-json.
        exec claude --model "$MODEL_ID" -p "$PROMPT" $TOOLS_ARG --dangerously-skip-permissions --verbose --output-format stream-json
    fi
elif [ "$TOOL" = "opencode" ]; then
    log "Starting OpenCode"
    OPENCODE_BIN=$(which opencode)
    log "opencode path: $OPENCODE_BIN"
    if [ -z "$ANTHROPIC_API_KEY" ]; then
        log "No ANTHROPIC_API_KEY set, OpenCode will use free models"
    fi
    echo ""
    echo "Press any key to start OpenCode..."
    read -n 1
    log "Key pressed, launching opencode..."
    exec "$OPENCODE_BIN"
    # If we reach here, exec failed
    log "ERROR: exec failed unexpectedly"
    exit 1
elif [ "$TOOL" = "codex" ]; then
    log "Starting Codex"
    if [ -z "$OPENAI_API_KEY" ] && [ ! -f "$HOME/.codex/auth.json" ]; then
        echo "No Codex authentication found."
        echo "Add your OpenAI API Key or enable Codex OAuth (ChatGPT) in Yolium Settings."
        echo "Falling back to shell."
        exec /bin/zsh
    fi
    CODEX_BIN=$(which codex)
    log "codex path: $CODEX_BIN"
    echo ""
    echo "Press any key to start Codex..."
    read -n 1
    log "Key pressed, launching codex..."
    # Use --full-auto with danger-full-access sandbox.
    # Docker already provides container-level isolation.
    exec "$CODEX_BIN" --full-auto --sandbox danger-full-access
    # If we reach here, exec failed
    log "ERROR: exec failed unexpectedly"
    exit 1
elif [ "$TOOL" = "claude" ]; then
    if [ -z "$ANTHROPIC_API_KEY" ] && [ ! -f "$HOME/.claude/.credentials.json" ]; then
        echo "No Claude authentication found."
        echo "Add your Anthropic API Key or enable Claude Max OAuth in Yolium Settings."
        echo "Falling back to shell."
        exec /bin/zsh
    fi
    if [ "${GSD_ENABLED:-true}" = "true" ]; then
        log "Starting Claude with GSD"
        echo ""
        echo "Press any key to start claude..."
        read -n 1
        npx get-shit-done-cc --global
        exec claude --dangerously-skip-permissions
    else
        log "Starting Claude without GSD"
        echo ""
        echo "Press any key to start claude..."
        read -n 1
        exec claude --dangerously-skip-permissions
    fi
else
    # Fallback to passed arguments (for backwards compatibility)
    log "Unknown TOOL '$TOOL', falling back to args: $@"
    exec "$@"
fi

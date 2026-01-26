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

# Setup network restrictions (HTTPS, SSH, DNS only)
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

    # Allow SSH (port 22) - SSH git operations
    sudo iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT

    # Drop everything else
    sudo iptables -A OUTPUT -j DROP

    add_status "🔒 Network restrictions applied (HTTPS/SSH/DNS only)"
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

if [ -n "$PROJECT_DIR" ] && [ ! -d "$PROJECT_DIR/.venv" ] && [ -f "$PROJECT_DIR/requirements.txt" -o -f "$PROJECT_DIR/pyproject.toml" -o -f "$PROJECT_DIR/setup.py" ]; then
    cd "$PROJECT_DIR"
    uv venv .venv 2>/dev/null
    add_status "✅ Virtual environment created at .venv/"
fi

if [ -d "/home/agent/.ssh" ]; then
    log "Configuring SSH permissions..."
    chmod 700 /home/agent/.ssh 2>/dev/null || true
    chmod 600 /home/agent/.ssh/* 2>/dev/null || true
    chmod 644 /home/agent/.ssh/*.pub 2>/dev/null || true
    chmod 644 /home/agent/.ssh/authorized_keys 2>/dev/null || true
    chmod 644 /home/agent/.ssh/known_hosts 2>/dev/null || true
    add_status "✅ SSH directory permissions configured"
    log "SSH permissions configured"
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

# Configure git credential helper if git-credentials file is mounted
if [ -f "/home/agent/.git-credentials" ]; then
    git config --global credential.helper 'store --file /home/agent/.git-credentials'
    add_status "✅ GitHub HTTPS credentials configured"
fi

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

 █████╗ ██████╗ ██╗  ██╗██╗███████╗███████╗
██╔══██╗██╔══██╗██║ ██╔╝██║██╔════╝██╔════╝
███████║██████╔╝█████╔╝ ██║█████╗  █████╗
██╔══██║██╔══██╗██╔═██╗ ██║██╔══╝  ██╔══╝
██║  ██║██║  ██║██║  ██╗██║███████╗███████╗
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝
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
    if [ "$TOOL" = "opencode" ]; then
        echo "   ~/.config/opencode  → OpenCode config & auth"
    else
        echo "   ~/.claude            → Claude CLI auth & settings"
    fi
    echo "   ~/.npm               → npm cache"
    echo "   ~/.cache/pip         → pip cache"
    echo "   ~/.m2                → Maven cache"
    echo "   ~/.gradle            → Gradle cache"
    echo "   ~/.yolium_history    → Shell command history"
    echo ""
    echo "🐍 Python: $(python3 --version 2>&1 | cut -d' ' -f2) (uv available)"
    echo "🟢 Node.js: $(node --version 2>/dev/null || echo 'not found')"
    echo "☕ Java: $(java -version 2>&1 | head -1 | cut -d'"' -f2 || echo 'not found')"
    if [ "$TOOL" = "opencode" ]; then
        echo "🤖 OpenCode: $(opencode --version 2>/dev/null || echo 'not found - check installation')"
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
log "TTY status: $(tty 2>&1 || echo 'no tty')"
log "=== Starting exec ==="

# Build command based on TOOL environment variable
# This is more robust than relying on Cmd array which can be corrupted by bundling
# NVM is already sourced above, so we can exec tools directly
if [ "$TOOL" = "shell" ]; then
    log "Starting shell mode"
    exec zsh
elif [ "$TOOL" = "opencode" ]; then
    log "Starting OpenCode"
    OPENCODE_BIN=$(which opencode)
    log "opencode path: $OPENCODE_BIN"
    echo ""
    echo "Press any key to start OpenCode..."
    read -n 1
    log "Key pressed, launching opencode..."
    exec "$OPENCODE_BIN"
    # If we reach here, exec failed
    log "ERROR: exec failed unexpectedly"
    exit 1
elif [ "$TOOL" = "claude" ]; then
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

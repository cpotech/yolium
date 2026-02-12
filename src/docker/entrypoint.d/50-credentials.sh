# Cleanup function for EXIT trap (handles git-credentials and OAuth cleanup)
cleanup() {
    rm -f /tmp/.git-credentials
    rm -rf /home/agent/.claude
    # Note: /home/agent/.claude-credentials.json is a bind mount and cannot be removed;
    # the actual credentials copy lives under /home/agent/.claude/ (cleaned above).
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

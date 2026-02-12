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

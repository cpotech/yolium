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

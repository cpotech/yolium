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

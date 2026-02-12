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

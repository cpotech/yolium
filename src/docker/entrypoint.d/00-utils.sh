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

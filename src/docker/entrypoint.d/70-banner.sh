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

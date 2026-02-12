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

# Decode base64 prompt (full system prompt + goal + conversation history)
PROMPT=$(echo "$AGENT_PROMPT" | base64 -d)
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to decode AGENT_PROMPT (invalid base64)"
    exit 1
fi

# Decode separate goal text (for non-Claude providers that need a focused prompt)
GOAL=""
if [ -n "$AGENT_GOAL" ]; then
    GOAL=$(echo "$AGENT_GOAL" | base64 -d)
    log "Goal decoded successfully (length: ${#GOAL})"
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

    # Write full agent instructions to a file for OpenCode to read.
    # Non-Claude models don't follow long system prompts in a single user message well.
    # By writing instructions to a file and passing a focused goal, the model gets:
    # 1. A clear, short task as its primary prompt
    # 2. Full instructions available via Read tool
    INSTRUCTIONS_FILE="$PROJECT_DIR/.yolium-agent-instructions.md"
    echo "$PROMPT" > "$INSTRUCTIONS_FILE"
    log "Agent instructions written to $INSTRUCTIONS_FILE"

    # Build a focused run prompt: goal + instruction to read the full protocol
    RUN_PROMPT="You are a Yolium AI agent. Your task:

$GOAL

IMPORTANT: Read the file .yolium-agent-instructions.md in the project root FIRST. It contains your full instructions, process steps, and the @@YOLIUM: protocol you MUST use to communicate progress.

Start by reading that file, then follow the process described in it step by step."

    # Select model
    if [ -z "$ANTHROPIC_API_KEY" ]; then
        log "No ANTHROPIC_API_KEY set, using free model opencode/kimi-k2.5-free"
        exec opencode run -m opencode/kimi-k2.5-free "$RUN_PROMPT"
    fi
    exec opencode run -m "$MODEL_ID" "$RUN_PROMPT"
elif [ "$AGENT_PROV" = "codex" ]; then
    log "Starting Codex headless agent mode"
    if [ -z "$OPENAI_API_KEY" ] && [ ! -f "$HOME/.codex/auth.json" ]; then
        echo "ERROR: No Codex authentication found."
        echo "Add your OpenAI API Key or enable Codex OAuth (ChatGPT) in Yolium Settings."
        exit 3
    fi
    # Configure Codex for autonomous agent work — default reasoning effort
    # is "none" which causes the agent to stop after analysis without
    # implementing changes. Set via both config.toml and -c flag for reliability.
    mkdir -p "$HOME/.codex"
    cat > "$HOME/.codex/config.toml" << 'CODEXCFG'
model_reasoning_effort = "high"
CODEXCFG
    # Use danger-full-access sandbox — Codex's Landlock sandbox panics on
    # kernels where Landlock is compiled but not functional.
    # Docker already provides container-level isolation.
    codex exec -c 'model_reasoning_effort="high"' --sandbox danger-full-access "$PROMPT" 2>&1 || {
        EXIT_CODE=$?
        echo "YOLIUM_AGENT_ERROR: Codex exited with error (exit code $EXIT_CODE)"
        exit $EXIT_CODE
    }
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

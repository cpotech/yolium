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
    # The full prompt (with inline protocol + system prompt) is passed directly.
    # No need to write a separate instructions file — agent-runner.ts already
    # inlines everything the model needs into $PROMPT.
    exec opencode run -m "$MODEL_ID" "$PROMPT"
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

    # Emit start protocol message (parsed by Yolium from raw stdout)
    AGENT_LABEL="${AGENT_NAME:-codex}"
    echo "@@YOLIUM:{\"type\":\"progress\",\"step\":\"start\",\"detail\":\"Starting ${AGENT_LABEL} agent\"}"

    codex exec --json -c 'model_reasoning_effort="high"' --sandbox danger-full-access "$PROMPT" 2>&1 || {
        EXIT_CODE=$?
        echo "@@YOLIUM:{\"type\":\"error\",\"message\":\"Codex exited with error (exit code ${EXIT_CODE})\"}"
        exit $EXIT_CODE
    }

    # Agent completed — build a meaningful completion summary
    if [ "$AGENT_NAME" = "plan-agent" ]; then
        if [ -f ".yolium/plan.md" ]; then
            SUMMARY="Implementation plan created and saved to .yolium/plan.md"
        else
            SUMMARY="Implementation plan created"
        fi
    else
        LAST_COMMIT=$(git log --oneline -1 --format="%s" 2>/dev/null | sed 's/\\/\\\\/g; s/"/\\"/g' | head -c 200 || true)
        if [ -f ".yolium/summary.md" ]; then
            # Use first line of summary file as the completion message
            FIRST_LINE=$(head -1 .yolium/summary.md | sed 's/^#* *//' | sed 's/\\/\\\\/g; s/"/\\"/g' | head -c 200 || true)
            SUMMARY="${FIRST_LINE:-Agent completed work}"
        elif [ -n "$LAST_COMMIT" ]; then
            SUMMARY="$LAST_COMMIT"
        else
            SUMMARY="Agent completed work"
        fi
    fi
    echo "@@YOLIUM:{\"type\":\"complete\",\"summary\":\"${SUMMARY}\"}"
    exit 0
elif [ "$AGENT_PROV" = "xai" ]; then
    log "Starting xAI (Grok) headless agent mode"
    if [ -z "$XAI_API_KEY" ]; then
        echo "ERROR: No xAI authentication found."
        echo "Add your xAI API Key in Yolium Settings."
        exit 3
    fi
    exec opencode run -m "xai/$MODEL_ID" "$PROMPT"
elif [ "$AGENT_PROV" = "openrouter" ]; then
    log "Starting OpenRouter headless agent mode (via OpenCode)"
    if [ -z "$OPENROUTER_API_KEY" ]; then
        echo "ERROR: No OpenRouter authentication found."
        echo "Add your OpenRouter API Key in Yolium Settings."
        exit 3
    fi
    exec opencode run -m "openrouter/$MODEL_ID" "$PROMPT"
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

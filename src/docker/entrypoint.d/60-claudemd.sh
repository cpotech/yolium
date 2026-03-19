# Create CLAUDE.md with Yolium environment info and project-specific context.
cat > /home/agent/CLAUDE.md << 'CLAUDEMD'
# Yolium Container Environment

You are running inside a Yolium container - an isolated Docker environment for AI coding agents.

## Git Access

If GitHub PAT was configured in Yolium settings:
- Git HTTPS operations work automatically (push, pull, clone)
- `gh` CLI is pre-authenticated - use it for GitHub operations (PRs, issues, etc.)
- Credentials are at `/home/agent/.git-credentials`

Check authentication status:
```bash
gh auth status
```

If `gh` is not authenticated but git credentials exist, authenticate manually:
```bash
grep 'github.com' /home/agent/.git-credentials | sed 's/.*:\(github_pat_[^@]*\|ghp_[^@]*\)@.*/\1/' | gh auth login --with-token
```

## Authentication

API keys are passed as environment variables by Yolium (configured in Settings):
- `ANTHROPIC_API_KEY` - Used by Claude Code and OpenCode
- `OPENAI_API_KEY` - Used by Codex CLI

Alternatively, Claude Code can use **Claude Max OAuth** tokens (enable in Settings).
When OAuth is enabled, only `~/.claude/.credentials.json` is mounted and staged into the container.

No other host config directories (e.g., `~/.codex`) are mounted into the container.

## Environment

- **Project directory**: Mounted at the path shown in the Yolium banner
- **Detected project types**: `$PROJECT_TYPES` (if provided by host)
- **Node package manager**: `$NODE_PACKAGE_MANAGER` (if provided by host)
- **Persistent caches**: npm, pip, maven, gradle, nuget caches persist across sessions
- **Languages**: Python (uv), Node.js (nvm), Java (SDKMAN), .NET (dotnet)
- **Network**: Restricted to HTTPS (443), IMAPS (993), SMTP (587), and DNS (53) only (unless YOLIUM_NETWORK_FULL=true)

## Important Paths

- `/home/agent/.git-credentials` - GitHub PAT (if configured)
- `/home/agent/.yolium_history` - Shell history (persistent)

## Testing

**Always run both unit tests and E2E tests** when the project has them.

### Sample Data
If a \`/Samples\` directory is mounted (via \`.yolium.json\` \`sharedDirs\`), use its contents for all tests. Never fabricate test fixtures when real samples are available.

### Authentication
Check the project \`.env\` file for E2E credentials:
- \`E2E_USER_EMAIL\` — test user email
- \`E2E_USER_PASSWORD\` — test user password

If these are required by the project's E2E tests but not set, STOP and report the error. Do not skip authentication or use mocked credentials.

### Fail-Fast
If E2E tests fail to execute (missing dependencies, missing credentials, configuration errors), stop immediately and report why. Do not proceed to commit.
CLAUDEMD

{
    echo ""
    echo "## Yolium Runtime Metadata"
    echo ""
    echo "- PROJECT_TYPES: ${PROJECT_TYPES:-not provided}"
    echo "- NODE_PACKAGE_MANAGER: ${NODE_PACKAGE_MANAGER:-auto-detect}"
} >> /home/agent/CLAUDE.md

append_context_file() {
    local source_path="$1"
    local heading="$2"
    local max_lines="${3:-120}"

    if [ -f "$source_path" ]; then
        {
            echo ""
            echo "## ${heading}"
            echo ""
            sed -n "1,${max_lines}p" "$source_path"
        } >> /home/agent/CLAUDE.md
    fi
}

if [ -n "$PROJECT_DIR" ]; then
    append_context_file "$PROJECT_DIR/README.md" "Project README (source: $PROJECT_DIR/README.md)" 120
    append_context_file "$PROJECT_DIR/CLAUDE.md" "Project CLAUDE.md (source: $PROJECT_DIR/CLAUDE.md)" 120
    append_context_file "$PROJECT_DIR/AGENTS.md" "Project AGENTS.md (source: $PROJECT_DIR/AGENTS.md)" 160
fi

if [ -n "$PROJECT_DIR" ] && { [ -f "$PROJECT_DIR/.mcp.json" ] || [ -f "$PROJECT_DIR/mcp.json" ]; }; then
    add_status "🔌 MCP configuration detected. To enable MCP servers, see Yolium documentation."
fi

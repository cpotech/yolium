export PATH="$HOME/.local/bin:$PATH"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
    log "Sourcing NVM..."
    export NVM_DIR="$HOME/.nvm"
    source "$NVM_DIR/nvm.sh"
    log "NVM sourced successfully"
fi

if [ -f "$HOME/.sdkman/bin/sdkman-init.sh" ]; then
    log "Sourcing SDKMAN..."
    source "$HOME/.sdkman/bin/sdkman-init.sh"
    log "SDKMAN sourced successfully"
fi

if [ -d "$HOME/.dotnet" ]; then
    log "Configuring .NET SDK..."
    export DOTNET_ROOT="$HOME/.dotnet"
    export PATH="$DOTNET_ROOT:$DOTNET_ROOT/tools:$PATH"
    export DOTNET_CLI_TELEMETRY_OPTOUT=1
    export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
    log ".NET SDK configured"
fi

# Install Node.js dependencies using explicit env metadata first, then lock-file detection.
if [ -n "$PROJECT_DIR" ] && [ -f "$PROJECT_DIR/package.json" ]; then
    cd "$PROJECT_DIR"
    NODE_PM="${NODE_PACKAGE_MANAGER:-}"
    if [ -z "$NODE_PM" ]; then
        if [ -f "pnpm-lock.yaml" ]; then
            NODE_PM="pnpm"
        elif [ -f "yarn.lock" ]; then
            NODE_PM="yarn"
        elif [ -f "package-lock.json" ] || [ -f "npm-shrinkwrap.json" ]; then
            NODE_PM="npm"
        else
            NODE_PM="npm"
        fi
    fi

    if [ "$NODE_PM" = "pnpm" ]; then
        if [ -f "pnpm-lock.yaml" ]; then
            pnpm install --frozen-lockfile >/dev/null 2>&1 && add_status "✅ pnpm dependencies installed"
        else
            pnpm install >/dev/null 2>&1 && add_status "✅ pnpm dependencies installed"
        fi
    elif [ "$NODE_PM" = "yarn" ]; then
        if [ -f "yarn.lock" ]; then
            yarn install --frozen-lockfile >/dev/null 2>&1 && add_status "✅ yarn dependencies installed"
        else
            yarn install >/dev/null 2>&1 && add_status "✅ yarn dependencies installed"
        fi
    else
        if [ -f "package-lock.json" ] || [ -f "npm-shrinkwrap.json" ]; then
            npm ci >/dev/null 2>&1 && add_status "✅ npm dependencies installed"
        else
            npm install >/dev/null 2>&1 && add_status "✅ npm dependencies installed"
        fi
    fi
fi

# Python environment + dependency bootstrap.
if [ -n "$PROJECT_DIR" ] && { [ -f "$PROJECT_DIR/requirements.txt" ] || [ -f "$PROJECT_DIR/pyproject.toml" ] || [ -f "$PROJECT_DIR/setup.py" ] || [ -f "$PROJECT_DIR/Pipfile" ]; }; then
    cd "$PROJECT_DIR"
    if [ ! -d ".venv" ]; then
        uv venv .venv >/dev/null 2>&1 && add_status "✅ Virtual environment created at .venv/"
    fi

    if [ -f "requirements.txt" ]; then
        uv pip install --python .venv/bin/python -r requirements.txt >/dev/null 2>&1 && add_status "✅ Python dependencies installed (requirements.txt)"
    elif [ -f "pyproject.toml" ] || [ -f "setup.py" ] || [ -f "Pipfile" ]; then
        uv pip install --python .venv/bin/python -e . >/dev/null 2>&1 && add_status "✅ Python project installed in editable mode"
    fi
fi

# Go module prefetch.
if [ -n "$PROJECT_DIR" ] && [ -f "$PROJECT_DIR/go.mod" ]; then
    cd "$PROJECT_DIR"
    go mod download >/dev/null 2>&1 && add_status "✅ Go modules downloaded"
fi

# Rust dependency prefetch.
if [ -n "$PROJECT_DIR" ] && [ -f "$PROJECT_DIR/Cargo.toml" ]; then
    cd "$PROJECT_DIR"
    cargo fetch >/dev/null 2>&1 && add_status "✅ Rust dependencies fetched"
fi

# Auto-restore .NET packages if a .NET project is detected
if [ -n "$PROJECT_DIR" ] && [ -d "$HOME/.dotnet" ]; then
    if ls "$PROJECT_DIR"/*.sln "$PROJECT_DIR"/*.csproj "$PROJECT_DIR"/*.fsproj 2>/dev/null | head -1 >/dev/null 2>&1; then
        export DOTNET_ROOT="$HOME/.dotnet"
        export PATH="$DOTNET_ROOT:$DOTNET_ROOT/tools:$PATH"
        cd "$PROJECT_DIR"
        dotnet restore --verbosity quiet >/dev/null 2>&1 && \
            add_status "✅ .NET packages restored"
    fi
fi

if [ -d "/tmp/host_direnv_allow" ]; then
    mkdir -p /home/agent/.local/share/direnv/allow
    cp /tmp/host_direnv_allow/* /home/agent/.local/share/direnv/allow/ 2>/dev/null && \
        add_status "✅ Direnv approvals copied from host"
fi

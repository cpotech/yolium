# Git config priority: env vars > host gitconfig > defaults
if [ -n "$GIT_USER_NAME" ] && [ -n "$GIT_USER_EMAIL" ]; then
    cat > /home/agent/.gitconfig << EOF
[user]
    email = $GIT_USER_EMAIL
    name = $GIT_USER_NAME
[init]
    defaultBranch = main
EOF
    add_status "✅ Using git identity: $GIT_USER_NAME <$GIT_USER_EMAIL>"
elif [ -f "/tmp/host_gitconfig" ]; then
    cp /tmp/host_gitconfig /home/agent/.gitconfig
else
    cat > /home/agent/.gitconfig << 'EOF'
[user]
    email = developer@localhost
    name = Developer
[init]
    defaultBranch = main
EOF
    add_status "ℹ️  Using default git identity (developer@localhost). Configure via Settings gear."
fi

# Mark the project directory as safe for git (fixes ownership mismatch with mounted volumes)
if [ -n "$PROJECT_DIR" ]; then
    git config --global --add safe.directory "$PROJECT_DIR"
fi

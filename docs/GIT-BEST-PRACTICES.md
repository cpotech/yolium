# Git Best Practices for Agent Contributors

This guide covers how to configure a repository for safe, efficient collaboration with AI coding agents.

## Branch Protection Rules

Protect your main branch to ensure all changes go through review.

**Settings → Branches → Add rule for `main`:**

| Setting | Recommended | Why |
|---------|-------------|-----|
| Require pull request before merging | Yes | Forces agents to create PRs, not push directly |
| Required approvals | 1+ | You review all agent work |
| Dismiss stale approvals | Yes | Re-review after agents push fixes |
| Require review from Code Owners | Yes | Auto-assigns you as reviewer |
| Require linear history | Yes | Clean history, easier bisect |
| Do not allow bypassing | Yes | No exceptions, even for admins |

## CODEOWNERS

Create `.github/CODEOWNERS` to auto-request yourself as reviewer:

```
# You own everything
* @your-username
```

## Merge Strategy

Use **squash and merge** as the default:

**Settings → General → Pull Requests:**
- Allow squash merging (default)
- Allow rebase merging (optional)
- Disable merge commits

Benefits:
- Each PR becomes one clean commit
- Messy agent commit history gets squashed
- Linear history maintained

## PAT Permissions for Agents

Create a Fine-grained Personal Access Token with minimal permissions:

**Required:**
- Contents: Read and write (push branches)
- Pull requests: Read and write (create PRs)
- Metadata: Read

**Never grant:**
- Admin access
- Bypass branch protections
- Delete repositories

## Git Worktrees for Parallel Work

Yolium uses git worktrees to let multiple agents work on the same repo simultaneously without conflicts.

### Why Worktrees?

Traditional git requires one working directory per clone. If two agents work on the same repo:
- They'd overwrite each other's uncommitted changes
- Branch switching would disrupt ongoing work
- You'd need multiple full clones (wastes disk space)

Worktrees solve this by creating isolated working directories that share the same `.git` history.

### How Yolium Uses Worktrees

When an agent starts work, Yolium:

1. Creates a new branch: `yolium-{timestamp}`
2. Creates a worktree at: `~/.yolium/worktrees/yolium-{project-hash}/{branch}`
3. Agent works in the isolated worktree
4. Changes are committed and pushed to create a PR
5. Worktree can be deleted after PR is merged

```
Main repo (your working copy)
├── .git/
├── src/
└── ...

Worktree (agent's isolated copy)
~/.yolium/worktrees/yolium-abc123/feature-branch/
├── src/  (same files, different branch)
└── ...
```

### Benefits

- **Parallel agents**: Multiple agents work simultaneously on different features
- **No conflicts**: Each agent has its own working directory
- **Shared history**: All worktrees share commits, branches, and remotes
- **Disk efficient**: Only changed files are duplicated, not the entire `.git`
- **Clean main**: Your main working copy stays untouched

### Manual Worktree Commands

```bash
# List all worktrees
git worktree list

# Create a worktree for a new branch
git worktree add ../feature-branch -b feature-branch

# Create a worktree for an existing branch
git worktree add ../bugfix-branch bugfix-branch

# Remove a worktree
git worktree remove ../feature-branch

# Clean up stale worktree references
git worktree prune
```

## Recommended Workflow

1. **Agent creates branch** in a worktree (isolated from your main copy)
2. **Agent commits and pushes** to the branch
3. **Agent creates PR** targeting `main`
4. **You get notified** (CODEOWNERS auto-assigns you)
5. **You review and approve** (agents cannot self-approve)
6. **You merge** (squash and merge for clean history)
7. **Worktree cleaned up** after merge

## Commit Message Format

Enforce consistent commit messages:

```
(type) Short description

Longer explanation if needed.
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`

## Security Considerations

- **Never commit secrets**: Add `.env`, credentials to `.gitignore`
- **Review agent code carefully**: Agents can make mistakes or introduce vulnerabilities
- **Audit PAT usage**: Regularly review token activity in GitHub settings
- **Rotate tokens**: Periodically regenerate agent PATs
- **Limit repo access**: Only grant agent PAT access to specific repositories
- **OAuth credentials**: If using Claude Max OAuth, `~/.claude/.credentials.json` is mounted read-only into containers and cleaned up on exit. If using Codex OAuth (ChatGPT), `~/.codex/auth.json` is mounted read-only the same way. Credentials never persist inside containers

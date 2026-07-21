# Herdr

This Stow package tracks the intentional Herdr configuration in
`.config/herdr/config.toml`.

Deploy and reload it from the repository root:

```bash
just stowall
herdr server reload-config
```

## Worktree workflow

Herdr's **New worktree** shortcut creates a branch from the parent workspace's
current `HEAD`. Herdr does not currently provide a config option for changing
that base to `origin/main` and does not fetch the remote automatically.

To use the shortcut with an up-to-date `origin/main`, first update the parent
workspace:

```bash
git fetch --prune origin
git switch main
git merge --ff-only origin/main
```

Then use these shortcuts from the parent repository workspace:

| Action | Shortcut |
|---|---|
| Create a worktree | `ctrl+b`, then `Shift+G` |
| Open an existing worktree | `ctrl+b`, then `Shift+O` |
| Delete the active managed worktree checkout | `ctrl+b`, then `Option+D` |

The create dialog starts with a generated branch name. Type the desired branch
name to replace it, then press Enter. If that local branch already exists,
Herdr checks it out instead of creating a new branch.

Deleting a checkout asks for confirmation and does not delete its Git branch.

### Explicit `origin/main` fallback

When the parent workspace must not be updated, or the worktree must be based
explicitly on the remote-tracking branch, use the CLI:

```bash
git fetch --prune origin
herdr worktree create \
  --cwd "$PWD" \
  --branch feat/scope/task \
  --base origin/main \
  --label "Short task description" \
  --focus
```

List and remove worktrees with:

```bash
herdr worktree list --cwd /path/to/primary/repository
herdr worktree remove --workspace <workspace-id>
```

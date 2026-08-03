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
| Delete the active managed worktree checkout | `ctrl+b`, then `Shift+D` |

The create dialog starts with a generated branch name. Type the desired branch
name to replace it, then press Enter. If that local branch already exists,
Herdr checks it out instead of creating a new branch.

Deleting a checkout asks for confirmation and does not delete its Git branch.
The configured remove binding is `prefix+shift+d`, avoiding any dependency on
how a macOS terminal handles the Option key.

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

## Removing merged worktrees

From the primary checkout, list the worktrees and their Herdr workspace IDs:

```bash
herdr worktree list --cwd . | jq
```

Before removal, verify that each linked worktree is clean:

```bash
git -C /path/to/linked/worktree status --short
```

For each linked worktree with an `open_workspace_id`, remove it through Herdr:

```bash
herdr worktree remove --workspace <open_workspace_id>
```

A closed worktree has no `open_workspace_id`. Open it with `ctrl+b`, then
`Shift+O`, run the list command again to obtain its new workspace ID, and remove
it with the same command. Repeat until the list contains only the primary
checkout.

Herdr removes the checkout but retains the local branch. Delete merged branches
separately if they are no longer needed:

```bash
git branch -d <branch-name>
```

The safe `-d` form refuses to delete a branch Git does not consider merged.

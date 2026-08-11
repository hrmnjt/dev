# Herdr

This Stow package tracks the intentional Herdr configuration in
`.config/herdr/config.toml`.

Deploy and reload it from the repository root:

```bash
just stowall
herdr server reload-config
```

## Default worktree tabs plugin

The local `hrmnjt.default-tabs` plugin creates the standard layout whenever
Herdr creates a managed worktree or opens a closed existing worktree:

1. Rename the initial tab to `shell` and leave its Zsh prompt available.
2. Create and focus a full-tab `pi` terminal in the worktree directory, then
   start `pi` in it.
3. Create a full-tab `nvim` terminal in the worktree directory and start
   Neovim in it, while leaving the `pi` tab focused.

Opening a worktree whose Herdr workspace is already open only focuses it and
does not create duplicate tabs.

The tracked plugin source is deployed by Stow:

```text
herdr/.config/herdr/local-plugins/default-tabs/
  herdr-plugin.toml
  default_tabs.sh

~/.config/herdr/local-plugins/default-tabs/
  herdr-plugin.toml
  default_tabs.sh
```

Herdr keeps its generated plugin registry, plugin-owned configuration, and
runtime state separately under `~/.config/herdr/plugins.json`,
`~/.config/herdr/plugins/`, and `~/.local/state/herdr/plugins/`. Do not track
those mutable files.

After `just stowall`, activate the plugin once on each Mac:

```bash
herdr plugin link ~/.config/herdr/local-plugins/default-tabs
herdr plugin list --plugin hrmnjt.default-tabs
```

Relinking the same path refreshes its registration. Manage or troubleshoot it
with:

```bash
herdr plugin log list --plugin hrmnjt.default-tabs
herdr plugin disable hrmnjt.default-tabs
herdr plugin enable hrmnjt.default-tabs
herdr plugin unlink hrmnjt.default-tabs
```

### Test the default tabs

From a clean primary checkout, create a disposable worktree through the normal
shortcut: press `ctrl+b`, then `Shift+G`, replace the generated branch with
`chore/herdr/test-default-tabs`, and press Enter.

The new workspace should open with exactly three full-screen tabs:

- `shell`, at a Zsh prompt in the test worktree on the test branch.
- `pi`, focused with Pi running in the same worktree.
- `nvim`, with Neovim running from the same worktree root.

Select `shell` and verify its Git context:

```bash
pwd
git branch --show-current
git status --short
```

The branch should be `chore/herdr/test-default-tabs`. Check the event hook when
the tabs do not appear:

```bash
herdr plugin log list --plugin hrmnjt.default-tabs
```

To also test reopening an existing checkout, exit Pi and close only its Herdr
workspace from the `shell` tab:

```bash
herdr workspace close "$HERDR_WORKSPACE_ID"
```

The Git worktree remains on disk. From the parent workspace, press `ctrl+b`, then
`Shift+O`, and select the test worktree. It should again open with `shell`,
focused `pi`, and `nvim` tabs, this time through the `worktree.opened` hook.

To clean up, exit Pi, remove the active test worktree with `ctrl+b`, then
`Shift+D`, and delete the retained branch from the primary checkout:

```bash
git branch -d chore/herdr/test-default-tabs
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

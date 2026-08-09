# Zsh configuration

This package sets the XDG environment, Neovim as the default terminal editor,
Homebrew shell environment, prompt, aliases, local-tool paths, and the `wt` Git
worktree helper.

Deploy and reload it from the repository root:

```bash
just stowall
loadshell
```

`loadshell` starts a fresh login shell instead of sourcing `.zshrc`, preserving
Ghostty shell integration.

## Git worktree helper

`wt` provides a lightweight shell-only workflow for creating, selecting, and
removing Git worktrees. It defaults new branches to `origin/main` and stores
linked checkouts beside the primary repository:

```text
<primary-repository>.worktrees/<branch-with-slashes-replaced-by-dots>
```

Examples:

```bash
wt                              # fzf-select an existing worktree and enter it
wt feat/pi/example              # enter it, or create it from origin/main
wt --no-fetch feat/pi/example   # create without fetching first
wt ls                           # list worktrees
wt go feat/pi/example           # enter an existing worktree
wt new feat/pi/example          # explicitly create a worktree
wt rm feat/pi/example           # remove a clean worktree
wt rm --force feat/pi/example   # remove despite uncommitted changes
wt clean                        # fzf multi-select worktrees to remove
wt prune                        # prune Git metadata and empty directories
wt help                         # show the complete command reference
```

Override the default base when needed:

```bash
WT_BASE=origin/develop wt new feat/pi/example
wt new feat/pi/example origin/develop
```

The helper fetches and prunes `origin` before creating a worktree unless
`--no-fetch` is used. It reuses existing local or remote branches, refuses to
remove the primary or current worktree, and does not delete the Git branch when
removing a checkout.

`git` and `fzf` are required and are tracked in `Brewfile`.

## Relationship to Herdr

The shell helper remains useful for small, terminal-only workflows, but
[Herdr](../herdr/README.md) may replace it as the primary worktree workflow.
Herdr adds persistent workspaces, tabs, lifecycle integration with Pi, and
managed worktree shortcuts. Keep `wt` until the Herdr workflow covers the same
lightweight use cases reliably.

## Other shell conveniences

Notable commands and aliases include:

| Command | Purpose |
|---|---|
| `loadshell` | Start a fresh login shell |
| `l` | Detailed `eza` listing including hidden files and Git state |
| `cdp` | Enter the personal repositories directory |
| `cdw` | Enter the work repositories directory |
| `gbclean` | Remove merged local branches whose upstream is gone |
| `llm` | Manage and inspect the host llama.cpp router service |

# Zsh configuration

This package sets the XDG environment, Neovim as the default terminal editor,
Homebrew shell environment, persistent history, completions, fuzzy search, the
`JAVA_HOME` used by local Spark (work ingestion tests), prompt, aliases,
local-tool paths, and the `wt` Git worktree helper.

Deploy and reload it from the repository root:

```bash
just stowall
loadshell
```

`loadshell` starts a fresh login shell instead of sourcing `.zshrc`, preserving
Ghostty shell integration.

## History, completion, and fuzzy search

Zsh keeps up to 50,000 persistent history entries in `~/.zsh_history`, shares
new commands between active shells, and removes duplicates while retaining the
most recent occurrence. Native `compinit` completion is enabled.

### History privacy

Prefix a command with a literal space when it should not be saved:

```zsh
 print -r -- "temporary sensitive command"
```

`HIST_IGNORE_SPACE` excludes that line. Enter another command afterward so Zsh
also removes the temporarily retained in-memory entry. This is a convenience,
not a security boundary: prefer a tool's secure prompt or stdin for secrets,
and remember that arguments may still appear in process listings, terminal
scrollback, logs, or application telemetry.

If a command is recorded accidentally, close every other active shell first and
run:

```zsh
histedit
```

This writes the current history, opens `~/.zsh_history` in `$VISUAL` or
`$EDITOR`, and reloads the edited file into the current shell after the editor
closes. Remove the complete entry, including its extended-history metadata.
Other active shells must be closed because their in-memory copies could restore
the entry. Rotate any real credential that reached a command line; editing shell
history does not make an exposed credential safe again.

To test exclusion across two terminals, enter a dummy command with a leading
space in the first, then enter `true`. In the second, confirm `Ctrl-R` cannot
find the dummy value. Also run a harmless command without the leading space and
confirm that the second terminal can find it, proving shared history still
works.

The official `fzf --zsh` integration is loaded when `fzf` is available:

| Binding | Action |
|---|---|
| `Ctrl-R` | Search command history |
| `Ctrl-T` | Insert a selected file or directory |
| `Alt-C` | Change to a selected directory |
| `**` then `Tab` | Trigger fuzzy completion |

The integration is guarded so a shell still starts before Homebrew packages are
installed on a new Mac.

## Interactive feedback

Two small plugins are sourced directly from Homebrew without a plugin manager:

- `zsh-autosuggestions` shows a suggestion from history as you type. Press the
  right arrow or `End` to accept it.
- `zsh-syntax-highlighting` identifies valid and invalid commands before they
  run. It is sourced after every other shell integration, as required upstream.

Their source paths are guarded, so `.zshrc` remains usable before `just brewinst`
installs the formulas on a new Mac. Reload with `loadshell` after installation.

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
| `histedit` | Edit and reload shell history after closing other shells |
| `llm` | Manage and inspect the host llama.cpp router service |

Homebrew is initialized once in `.zprofile`; `.zshrc` does not repeat it.

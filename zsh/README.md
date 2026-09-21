# Zsh configuration

This package sets the XDG environment, Neovim as the default terminal editor,
Homebrew shell environment, persistent history, completions, fuzzy search, the
`JAVA_HOME` used by local Spark (work ingestion tests), prompt, aliases, and
local-tool paths.

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

Their source paths are guarded, so `.zshrc` remains usable before the formulas
are installed with `brew bundle install`. Reload with `loadshell` afterward.

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

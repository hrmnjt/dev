# Neovim

A small [LazyVim](https://www.lazyvim.org/) configuration with mouse support,
the macOS clipboard and the repository's Gruvbox theme.

Ghostty already supplies the JetBrains Mono Nerd Font used by the interface.

## Install

Run on the host Mac from the repository root:

```bash
brew bundle install
just stowall
nvim
```

LazyVim installs its plugins during the first launch. Let installation finish,
quit, and open Neovim again. If an earlier Neovim installation interferes, back
up its runtime data and retry:

```bash
mv ~/.local/share/nvim ~/.local/share/nvim.bak
mv ~/.local/state/nvim ~/.local/state/nvim.bak
mv ~/.cache/nvim ~/.cache/nvim.bak
nvim
```

## Start here

Use the mouse freely while learning. Clicking places the cursor, dragging makes
a visual selection, the scroll wheel scrolls, and split borders can be dragged.
Press `Esc` whenever the current mode is unclear.

The explorer, file picker, and project search include hidden and Git-ignored
files by default. In the explorer, `H` and `I` toggle those filters; in other
pickers, use `Alt-h` and `Alt-i`.

| Task | Action |
|---|---|
| Open the current project without the explorer | `nvim` |
| Explore files | `Space e` |
| Find a file | `Space Space` |
| Search project text | `Space /` |
| Review and commit Git changes | `Space g g` |
| Save | `Ctrl-s` |
| Switch open buffers | `Shift-h` / `Shift-l` |
| Open a terminal | `Ctrl-/` |
| Close the current window | `:q` then `Enter` |
| Exit Neovim | `Space q q` |
| Discover commands | Press `Space` and wait |
| Interactive Vim lesson | `:Tutor` then `Enter` |

The tracked Zsh configuration exports Neovim as `EDITOR` and `VISUAL`.

## Git with Lazygit

The repository `Brewfile` installs
[Lazygit](https://github.com/jesseduffield/lazygit). LazyVim detects that
executable at startup and exposes it through its built-in Snacks integration;
no additional Neovim plugin is needed. The tracked
[Lazygit configuration](../lazygit/README.md) applies the same Gruvbox palette
inside and outside Neovim.

- `Space g g` opens Lazygit at the current Git repository root.
- `Space g G` opens Lazygit in Neovim's current working directory.
- `lazygit` starts the same interface directly from a shell.

In Lazygit, use `Space` to stage or unstage the selected item, `a` to stage or
unstage all changes, `c` to commit, and `?` to show context-sensitive help.
If the mappings are missing, ensure Lazygit is installed and restart Neovim.

## hledger journals

[`vim-ledger`](https://github.com/ledger/vim-ledger) provides syntax
highlighting, completion, and posting alignment for `*.journal`, `*.ledger`,
and `*.hledger` files. It is configured to use the `hledger` executable already
tracked in the Brewfile.

Run `:LedgerAlign` on the current line or visual range, or
`:LedgerAlignBuffer` to align every posting in the buffer. Whole-file external
formatting through `hledger print` remains explicitly disabled because it is
not a lossless transformation of directives, includes, and comments.

## Configuration

### Changes on top of LazyVim

- Use classic Gruvbox Dark Hard (`contrast = "hard"`) with a transparent
  background so Ghostty controls the terminal backdrop. After `just theme nord`,
  new Neovim instances use `gbprod/nord.nvim`, also transparent;
  `lua/config/theme.lua` reads the selection at start, also for lazy.nvim's
  install screen (see [Nord](../NORD.md)).
- Show 80/120-column guides.
- Include hidden and Git-ignored files in pickers by default.
- Install and theme Lazygit for LazyVim's built-in Git interface.
- Add hledger journal highlighting, completion, and safe posting alignment.
- Disable `render-markdown.nvim` and Neovim text conceal so Markdown remains
  visible as plain source, including code fences when the cursor moves away.
- Disable spell checking in every buffer.

`lazy-lock.json` remains host-local and Git-ignored, rather than Stow-managed.
Plugin updates do not create tracked lock-file changes or a new deployment conflict.

Useful maintenance commands:

- `:Lazy` — inspect, update, or clean plugins.
- `:LazyExtras` — enable language support when it is actually needed.
- `:checkhealth` — diagnose Neovim, clipboard, parser, and provider issues.

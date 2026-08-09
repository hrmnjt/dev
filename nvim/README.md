# Neovim

A deliberately small [LazyVim](https://www.lazyvim.org/) configuration intended
to replace day-to-day Zed use gradually. Mouse support, the macOS clipboard,
and sensible editor defaults come from LazyVim. This package adds Gruvbox and
80/120-column guides.

Ghostty already supplies the JetBrains Mono Nerd Font used by the interface.

## Install

Run on the host Mac from the repository root:

```bash
just brewinst
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
| Save | `Ctrl-s` |
| Switch open buffers | `Shift-h` / `Shift-l` |
| Open a terminal | `Ctrl-/` |
| Close the current window | `:q` then `Enter` |
| Exit Neovim | `Space q q` |
| Discover commands | Press `Space` and wait |
| Interactive Vim lesson | `:Tutor` then `Enter` |

For the first week, avoid adding plugins. Learn file finding, project search,
insert mode, saving, and quitting. Add configuration only after the same friction
has appeared repeatedly.

The tracked Zsh configuration exports Neovim as `EDITOR` and `VISUAL`. Keep Zed
available as an escape hatch during the transition.

## Configuration

```text
nvim/.config/nvim/
├── init.lua
└── lua/
    ├── config/
    │   ├── lazy.lua       # official LazyVim-style bootstrap
    │   ├── options.lua    # mouse, clipboard, and column guides
    │   ├── keymaps.lua    # intentionally empty
    │   └── autocmds.lua   # intentionally empty
    └── plugins/
        ├── picker.lua     # show hidden and ignored files
        └── theme.lua      # Gruvbox
```

Useful maintenance commands:

- `:Lazy` — inspect, update, or clean plugins.
- `:LazyExtras` — enable language support when it is actually needed.
- `:checkhealth` — diagnose Neovim, clipboard, parser, and provider issues.

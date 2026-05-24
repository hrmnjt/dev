# nvim config

LazyVim-based Neovim config for **Python · SQL · Markdown**.

## Structure

```
nvim/.config/nvim/
├── init.lua                    -- entry point
├── lua/
│   ├── config/
│   │   ├── lazy.lua            -- lazy.nvim + LazyVim setup
│   │   ├── options.lua         -- vim options
│   │   ├── keymaps.lua         -- custom keymaps
│   │   └── autocmds.lua        -- custom autocmds
│   └── plugins/
│       ├── theme.lua           -- gruvbox theme
│       └── lang.lua            -- SQL + Markdown LSP/lint/format
```

## What's included

**LazyVim base** comes with: telescope, blink.cmp, mason, nvim-lspconfig, conform, gitsigns, mini.nvim, neo-tree, which-key, indent-blankline, todo-comments, and more.

**On top:**

| What | How |
|------|-----|
| Python LSP + format + lint | `lazyvim.plugins.extras.lang.python` (basedpyright + ruff) |
| SQL LSP | sqlls |
| SQL lint + format | sqlfluff (via conform + nvim-lint) |
| Markdown LSP | marksman |
| Markdown lint + format | markdownlint (via conform + nvim-lint) |
| Markdown rendering | render-markdown.nvim |
| Theme | gruvbox |

## Install

```bash
# On your host Mac
cd ~/code/github.com/hrmnjt/dev

# Clean any existing nvim data
mv ~/.local/share/nvim ~/.local/share/nvim.bak 2>/dev/null
mv ~/.local/state/nvim ~/.local/state/nvim.bak 2>/dev/null
mv ~/.cache/nvim ~/.cache/nvim.bak 2>/dev/null

# Stow the new config
stow -t ~ nvim

# First launch — plugins + LSP servers install automatically
nvim
```

First launch takes 1-2 minutes. Restart once after everything installs.

Type `<leader>` (space) and wait — which-key shows all available keymaps.

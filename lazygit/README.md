# Lazygit

Gruvbox colors for
[Lazygit](https://github.com/jesseduffield/lazygit), used both as a standalone
terminal interface and through LazyVim's built-in Snacks integration. Commit
authors and their graph lines use Gruvbox aqua instead of Lazygit's random
colors, avoiding low-contrast blues on the dark background.

The tracked Zsh environment sets `XDG_CONFIG_HOME=~/.config`, so Stow deploys:

```text
lazygit/.config/lazygit/config.yml -> ~/.config/lazygit/config.yml
lazygit/.config/lazygit/nord.yml -> ~/.config/lazygit/nord.yml
```

`nord.yml` holds only Nord theme colors. With `just theme nord`, Zsh sets
`LG_CONFIG_FILE` to `config.yml,nord.yml`, so Lazygit merges them in that
order. Inside Neovim, LazyVim adds its own theme file from the colorscheme on
top. See [Nord](../NORD.md).

## Install

Run on the host Mac from the repository root:

```bash
brew bundle install
just stowall
```

Start Lazygit directly with `lazygit` or from Neovim with `Space g g`. Close and
reopen Lazygit after changing its configuration.

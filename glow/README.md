# Glow Markdown renderer

This package deploys a classic Gruvbox Dark Hard Glamour stylesheet:

```text
glow/.config/glow/themes/gruvbox-dark-hard.json -> ~/.config/glow/themes/gruvbox-dark-hard.json
```

The palette comes from [the repository reference](../GRUVBOX.md) and is based
on the earlier tracked Glow style. `zsh/.zshrc` sets `GLOW_STYLE` to the
installed stylesheet using `$HOME`, so both `glow README.md` and Glow's TUI
pick it up in new Zsh sessions. Glow needs an absolute style path at render
time; putting `~` or `$HOME` literally in `glow.yml` does not work reliably.
The stylesheet controls rendered Markdown, not every color of Glow's file
browser UI.

On the Mac, run `brew bundle install` and `just stowall`, then open a new Zsh
session (`loadshell`) and try:

```zsh
glow README.md
glow
```

For one invocation, `glow -s dark README.md` overrides the custom style.

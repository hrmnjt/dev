# Glow Markdown renderer

This package deploys classic Gruvbox Dark Hard and Nord Glamour stylesheets
and an intentional Glow configuration:

```text
glow/.config/glow/glow.yml -> ~/.config/glow/glow.yml
glow/.config/glow/themes/gruvbox-dark-hard.json -> ~/.config/glow/themes/gruvbox-dark-hard.json
glow/.config/glow/themes/nord.json -> ~/.config/glow/themes/nord.json
```

The palette comes from [the repository reference](../GRUVBOX.md) and is based
on the earlier tracked Glow style; `nord.json` keeps its structure with
[Nord](../NORD.md) colors. `zsh/.zshrc` sets `GLOW_STYLE` to the installed
stylesheet for the selected theme using `$HOME`, so both `glow README.md` and
Glow's TUI pick it up; open shells follow `just theme` at their next prompt. Glow needs an absolute style path at render
time; putting `~` or `$HOME` literally in `glow.yml` does not work reliably.
The tracked `glow.yml` keeps Glow's current CLI and TUI defaults and uses
`style: auto` when launched outside Zsh; `GLOW_STYLE` overrides this fallback
in Zsh. The stylesheet controls rendered Markdown, not every color of Glow's
file browser UI.

On the Mac, run `brew bundle install` and `just stowall`, then open a new Zsh
session (`loadshell`) and try:

```zsh
glow README.md
glow
```

For one invocation, `glow -s dark README.md` overrides the custom style.

# Ghostty configuration

This package configures Ghostty as the primary terminal.

```text
ghostty/.config/ghostty/config -> ~/.config/ghostty/config
```

The configuration uses JetBrains Mono Nerd Font, the Gruvbox Dark Hard theme,
a translucent blurred background, and an 18-point font. Window maximization is
left to AeroSpace rather than forced by Ghostty.

Install and deploy from the repository root:

```bash
just brewinst
just stowall
```

Restart Ghostty or open a new window after changing the configuration. Shell
integration for fresh login shells is handled in `zsh/.zshrc`.

# Gruvbox Dark Hard

Classic [Gruvbox](https://github.com/morhetz/gruvbox) Dark Hard is the visual
reference for this setup. Use native app themes where available; this document
is a palette and mapping, not a generated theme framework. App UI chrome may
differ even when its editor and terminal surfaces match.

| Role | Color | Usage |
|---|---|---|
| Background | `#1d2021` | Hard editor and terminal background |
| Raised background | `#282828` | Panels and cards |
| Selection | `#3c3836` | Selected rows and secondary surfaces |
| Foreground | `#ebdbb2` | Main text |
| Bright foreground | `#fbf1c7` | Emphasis |
| Accent | `#fabd2f` | Focused-window border and active Lazygit border |
| Subdued border | `#665c54` | Inactive borders |
| Success | `#98971a` | Status and prompts; `#8ec07c` for brighter emphasis |
| Warning | `#d79921` | Status; `#fabd2f` for brighter emphasis |
| Error | `#cc241d` | Status; `#fb4934` for brighter emphasis |
| Orange | `#fe8019` | Highlights; macOS uses its native orange accent |

## Current surfaces

| Surface | Source of theme | Notes |
|---|---|---|
| Ghostty | `ghostty/.config/ghostty/config` | Built-in Gruvbox Dark Hard; background opacity is independently set to `0.9`. |
| Zed | `zed/.config/zed/settings.json` | Built-in `Gruvbox Dark Hard` (no extension); editor and terminal backgrounds are `#1d2021`. Zed's UI chrome has app-specific shades. |
| Neovim | `nvim/.config/nvim/lua/plugins/theme.lua` | Classic `gruvbox.nvim`, explicit `contrast = "hard"`; transparency lets Ghostty draw the background. |
| Starship | `starship/.config/starship.toml` | Hand-picked classic foreground/accent colors; no full-screen background. |
| `fzf` | `zsh/.zshrc` | Classic Dark Hard background and selection. |
| Glow | `glow/.config/glow/themes/gruvbox-dark-hard.json` | Classic Markdown colors; `zsh/.zshrc` supplies the absolute style path via `GLOW_STYLE`. Glow's browser chrome is app-owned. |
| Lazygit | `lazygit/.config/lazygit/config.yml` | Classic colors, including brighter shades for focus and changes. |
| Pi | `pi/.pi/agent/themes/gruvbox-dark.json` | Classic Dark Hard background and status colors; uses separate dimmer shades for a few message surfaces. |
| Herdr | `herdr/.config/herdr/config.toml` | Built-in `gruvbox` theme; the app owns its palette. |
| AeroSpace borders | `aerospace/.config/aerospace/aerospace.toml` | Bright yellow active, subdued gray inactive. The native workspace indicator is styled in AeroSpace's UI. |
| macOS and wallpaper | `Justfile`, `wallpapers/` | Dark mode, native orange accent, tracked Pink Floyd Gruvbox wallpaper. |
| Brave | Manual setup in `README.md` | Gruvbox Slate browser theme; not managed by this repository. |
| Obsidian | Not themed here yet | A CSS snippet remains a separate optional visual project. |

The palette is a reference for choosing future colors, not a requirement to
replace app-provided themes or force every semantic role to one hex value. Add
a generator only if another actual theme profile makes duplication painful.

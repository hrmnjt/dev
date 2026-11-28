# Nord

[Nord](https://www.nordtheme.com/) is the secondary theme. Classic
[Gruvbox Dark Hard](GRUVBOX.md) stays the default: with nothing selected (a new
Mac, a VM, a missing state file) everything is Gruvbox. Like `GRUVBOX.md`, this
is a palette and mapping, not a generated theme framework. Each app keeps a
small hand-written Nord file next to its Gruvbox one.

## Switching

Run on the host Mac after `just stowall`:

```bash
just theme          # print the selected theme
just theme nord     # switch to Nord
just theme gruvbox  # switch back
```

The choice is one line in `~/.local/state/hrmnjt-dev/theme`, or under
`$XDG_STATE_HOME` when that is set. AeroSpace always reads the default path.
`just theme <name>` runs `_scripts/theme.sh`, which writes the selection and then:

- links `~/.config/ghostty/theme.local` to `nord.conf`, or removes it for Gruvbox;
- on macOS, keeps dark mode and sets the accent colour (orange or blue), the
  wallpaper and any running AeroSpace borders.

It refuses to change anything if `~/.config/ghostty` is a folded Stow link or
`theme.local` is a real file. Afterwards, reload Ghostty with Cmd+Shift+,.
Open shells switch at their next prompt, and Neovim when it next starts. In
Rex, run **Apply Appearance Preferences** from the command palette. Pi and
Brave switch by hand (below); Zed and Claude Code stay Gruvbox.

## Palette

| Role | Color | Usage |
|---|---|---|
| Background | `#2e3440` | nord0; editor and terminal background |
| Raised background | `#3b4252` | nord1; panels, the current fzf line, message backgrounds |
| Selection | `#434c5e` | nord2; selected rows and secondary surfaces |
| Subdued border | `#4c566a` | nord3; inactive borders and rules |
| Comment | `#616e88` | Nord's brightened nord3; comments and Starship timings |
| Muted text | `#7b88a1` | Secondary text that must stay readable in Pi and Claude Code |
| Foreground | `#d8dee9` | nord4; main text |
| Bright foreground | `#eceff4` | nord6; emphasis and selected text |
| Accent | `#88c0d0` | nord8; cursor, focused-window border and active Lazygit border |
| Frost | `#8fbcbb` `#81a1c1` `#5e81ac` | nord7, nord9, nord10; types, keywords and secondary accents |
| Success | `#a3be8c` | nord14 |
| Warning | `#ebcb8b` | nord13 |
| Error | `#bf616a` | nord11 |
| Orange | `#d08770` | nord12; Claude's colour and inline code; macOS uses its native blue accent |
| Purple | `#b48ead` | nord15; numbers and highlights |

Nord has one shade per hue, so Gruvbox's dim and bright pairs become one
colour. Its background is lighter than Gruvbox's hard `#1d2021`, so Ghostty's
`0.9` opacity shows more wallpaper. nord3 is too dim for text on nord0; use
Comment or Muted text instead. Ghostty's Nord bright black, used by Zsh
autosuggestions, is `#596377`; override `palette = 8=` in `nord.conf` and the
Rex theme if it is too faint.

## Surfaces

| Surface | Source of theme | How it switches |
|---|---|---|
| Ghostty | `ghostty/.config/ghostty/nord.conf` | Built-in `Nord` with the accent cursor and nord2 selection. Linked as `theme.local`, which the main config includes last. |
| Rex | `rex/.config/rex/themes/nord` | Ghostty's Nord palette with the same cursor and selection. **Apply Appearance Preferences** in `init.lua` reads the selection, then imports and selects that theme; see `rex/README.md`. |
| Neovim | `nvim/.config/nvim/lua/plugins/theme.lua` | `gbprod/nord.nvim`, transparent like Gruvbox; reads the selection at start. LazyVim's Lazygit takes its colours from the colorscheme. |
| Starship | `starship/.config/starship.toml` | `[palettes.nord]` uses Gruvbox's key names. Zsh points `STARSHIP_CONFIG` at a copy in the state directory whose palette line selects it. |
| `fzf` | `zsh/.zshrc` | Nord `FZF_DEFAULT_OPTS`, set by the theme block. |
| Glow | `glow/.config/glow/themes/nord.json` | The Gruvbox style's structure with Nord colours, selected through `GLOW_STYLE`. |
| Lazygit | `lazygit/.config/lazygit/nord.yml` | Theme keys only, merged after `config.yml` through `LG_CONFIG_FILE`. |
| AeroSpace borders | `aerospace/.config/aerospace/aerospace.toml`, `_scripts/theme.sh` | Frost active, translucent nord3 inactive. Startup reads the selection and the script updates running borders; keep both colour pairs in sync. |
| macOS and wallpaper | `_scripts/theme.sh`, `wallpapers/` | Dark mode, blue accent and a generated Nord aurora wallpaper. |
| Pi | `pi/.pi/agent/themes/nord.json` | Pick `nord` in Pi's settings; Pi's `settings.json` is host-local. |
| Claude Code | `claude/.config/agent-vm/claude/themes/nord.json`, copied in `claude/.claude/themes/` | Ready but not switched. VM managed settings fix the theme, and `/theme` on the Mac would write through the Stow link into tracked settings. |
| Zed | None | Stays Gruvbox: Zed has no built-in Nord, and its theme lives in tracked settings. |
| Brave | Manual | Any Nord browser theme; not managed by this repository. |

Zsh owns `FZF_DEFAULT_OPTS`, `GLOW_STYLE`, `LG_CONFIG_FILE` and
`STARSHIP_CONFIG`, and uses each Nord file only once Stow has deployed it. The
switch is checked by `./_scripts/tests/theme.sh`, and Rex's action by
`./_scripts/tests/rex-worktrees.sh`.

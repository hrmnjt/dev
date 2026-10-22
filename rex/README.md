# Rex appearance

This Stow package provides an importable classic **Gruvbox Dark Hard** theme
for [Rex](https://www.superlogical.com/rex/docs/). It matches the
[shared palette](../GRUVBOX.md) and Ghostty's yellow cursor and dark selection
colors. The intended terminal font is **JetBrainsMono Nerd Font Mono, 18 pt**,
matching Ghostty and Zed; its Homebrew cask is already in `Brewfile`.

Rex's `~/.config/rex/init.lua` configures server actions and keybindings.
The macOS app keeps fonts and imported themes in native preferences, so this
package does not invent Lua appearance settings or Stow the app's mutable
preferences, sessions, or server state. Ghostty's opacity, padding, and shader
settings are not part of this theme.

## Deploy and select the theme

From the repository root:

```bash
just stowall
```

This deploys:

```text
rex/.config/rex/themes/gruvbox-dark-hard
  -> ~/.config/rex/themes/gruvbox-dark-hard
```

In Rex Settings, find **Themes**, import the deployed file as a Ghostty theme,
and select it for dark appearance. Use `Cmd-Shift-G` in the file picker to
enter `~/.config/rex/themes/`. Choose dark appearance rather than light mode.

Alternatively, from a Rex terminal with `rex` on PATH:

```bash
rex --autostart=false do client.appearance.switch_mode mode=dark
rex --autostart=false do client.theme.import \
  "path=$HOME/.config/rex/themes/gruvbox-dark-hard"
```

The import action imports **and selects** the theme. If several app clients
are connected, use `rex client ls` and add `-C <client-label-or-id>` before
`do` to target the intended one. Re-import after editing the theme: Rex stores
a copy rather than watching the source file. The Settings import works even
when the CLI is not on PATH.

## Fonts

In Rex's terminal typography settings, choose **JetBrainsMono Nerd Font Mono**,
**Regular**, **18 pt**. Set the default/global font size rather than only
zooming the current terminal; reset any existing pane-specific zoom if needed.
Leave the UI font and other typography settings at their app defaults.

For repeatable font-family/size setup, fully quit Rex first, then run these
macOS commands yourself and reopen the app:

```bash
defaults write com.superlogical.rex Workspace.terminalFontName \
  -string 'JetBrainsMono Nerd Font Mono'
defaults write com.superlogical.rex Workspace.terminalFontPointSize -float 18
```

These are native preference keys from Rex Beta 0.1.0 (build 1347), not Lua
configuration. They change only the default terminal family and size; use
Settings if a later beta changes its preference keys. Stow alone does not
apply them, and the app should not be running while they are written.

## Visual check

After importing, check a fresh terminal and Neovim/Pi for readable text,
Nerd Font icons, a yellow cursor, and dark selection. Rex derives its own UI
chrome from the theme; it need not look identical to Ghostty. If a saved
selection-color override wins over the import, adjust it in Terminal settings:
background `#3c3836`, foreground `#fbf1c7`.

The theme format and CLI actions were checked against the installed beta.
The docs site was unreachable during setup; live import, font rendering, and
selection behavior still need an interactive check. To undo, select another
theme and font in Settings; this package does not replace any other Rex config.

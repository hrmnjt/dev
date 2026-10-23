# Rex configuration

## TODO

- [ ] Install Rex through Homebrew when an official package is available.
  During preview, install the manually downloaded DMG.
- [ ] Move manual configuration below to supported configuration once stable:
  - Theme import, font, smoothing, and ligatures.
  - Text contrast, application colors, and sRGB.
  - Clipboard, split sizing, and pane focus.
  - Terminal/program notifications and sounds.

## 1. Deploy

From this repository:

```bash
just stowall
```

This links `init.lua` and `themes/gruvbox-dark-hard` into `~/.config/rex/`.
Review/merge any existing `init.lua` before deploying. Stow does not refresh Rex.

## 2. Set terminal preferences

**Quit Rex with `Cmd-Q`**, then run these from Ghostty or another terminal.
Alternatively, choose the same values in Rex Settings. These native keys were
checked in Beta 0.1.0 (1347); revisit them after upgrades.

```bash
# JetBrains Mono Nerd Font, 18 pt; the font cask is already in Brewfile.
defaults write com.superlogical.rex Workspace.terminalFontName \
  -string 'JetBrainsMono Nerd Font Mono'
defaults write com.superlogical.rex Workspace.terminalFontPointSize -float 18
defaults write com.superlogical.rex Workspace.terminalFontSmoothing -bool true
defaults write com.superlogical.rex Workspace.terminalAllowsLigatures -bool true

# Improve contrast, preserve Pi/Neovim colors, and use sRGB rather than P3.
defaults write com.superlogical.rex Workspace.terminalImproveTextContrast -bool true
defaults write com.superlogical.rex Workspace.terminalUseThemePalette -bool false
defaults write com.superlogical.rex Workspace.terminalUsesDisplayP3 -bool false

# Keep the clipboard intact; balance splits; click to focus panes.
defaults write com.superlogical.rex Workspace.terminalCopyOnSelect -bool false
defaults write com.superlogical.rex Workspace.balancesSplitsOnCreation -bool true
defaults write com.superlogical.rex Workspace.focusFollowsMouse -bool false

# Allow notifications without Rex's extra program-activity sounds.
defaults write com.superlogical.rex Workspace.allowsTerminalNotifications -bool true
defaults write com.superlogical.rex Workspace.showsProgramActivityNotifications -bool true
defaults write com.superlogical.rex Workspace.playsProgramActivitySounds -bool false
```

Reopen Rex. Choose the font's **Regular** face in Settings and reset any
pane-specific font zoom. Notifications need macOS permission and a program
that reports activity; these settings do not install agent hooks.

## 3. Import the theme

With Rex open and its CLI on PATH:

```bash
rex --autostart=false do client.appearance.switch_mode mode=dark
rex --autostart=false do client.theme.import \
  "path=$HOME/.config/rex/themes/gruvbox-dark-hard"
```

Or import that file in **Settings → Themes** as a Ghostty theme. With multiple
clients, use `rex client ls` and add `-C <client-label-or-id>` before `do`.
If a selection override remains, set background `#3c3836`, foreground `#fbf1c7`.

## After changing something

- **Theme file:** repeat the import; Rex stores a copy rather than watching it.
- **App Settings:** update the preferred values in this README too. They are
  stored in macOS preferences, backed by
  `~/Library/Preferences/com.superlogical.rex.plist`, not tracked here.
  Inspect with `defaults read com.superlogical.rex`; do not edit the plist directly.
- **`defaults` commands:** quit Rex before writing, then reopen. Undo individual
  choices in Settings rather than replacing the whole preference domain.
- **`init.lua`:** add supported keybindings, actions, or host declarations there,
  then check and reload:

  ```bash
  rex config check
  rex --autostart=false config reload
  ```

Lua reload does **not** re-import themes or apply native preferences. No setup
script is maintained during beta. Leave unrelated defaults and security choices
app-managed for now.

[Configuration guide](https://www.superlogical.com/rex/docs/customize/config) ·
[Lua API](https://www.superlogical.com/rex/docs/reference/lua) ·
[Shared palette](../GRUVBOX.md)

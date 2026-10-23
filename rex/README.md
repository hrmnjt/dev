# Rex configuration

This Stow package provides an importable classic **Gruvbox Dark Hard** theme
for [Rex](https://www.superlogical.com/rex/docs/), matching the
[shared palette](../GRUVBOX.md) and Ghostty's yellow cursor and dark selection.
Use **JetBrainsMono Nerd Font Mono, Regular, 18 pt**, as in Ghostty and Zed;
the font cask is already in `Brewfile`.

Rex is still in beta. Keep setup **manual and documented here** until its
configuration API stabilizes: no setup script, preference-management framework,
or automatic application on reload. When changing a preference, update its
value here too. Sessions, imported themes, and mutable preferences stay
app-owned rather than being Stow-managed.

## Deploy and refresh the theme

From the repository root:

```bash
just stowall
```

This links the theme to `~/.config/rex/themes/gruvbox-dark-hard`.
**Stow only updates symlinks; it does not tell Rex to reload.**

With Rex open and its CLI on PATH, run:

```bash
rex --autostart=false do client.appearance.switch_mode mode=dark
rex --autostart=false do client.theme.import \
  "path=$HOME/.config/rex/themes/gruvbox-dark-hard"
```

Importing **selects** the theme. Rex stores a copy, so repeat the import after
editing the source file. With several app clients connected, use
`rex client ls` and add `-C <client-label-or-id>` before `do` to target the
intended local app. The file path must be available on that Mac.

Without the CLI, use Settings → Themes to import the file as a Ghostty theme
and select dark appearance. Use `Cmd-Shift-G` in the file picker to enter
`~/.config/rex/themes/`.

Ghostty's opacity, padding, and shader settings are not part of this theme.
Rex owns its UI chrome. If a saved selection override wins over the import,
set selection background to `#3c3836` and foreground to `#fbf1c7` in Settings.

## Recommended settings

Prefer Rex Settings for day-to-day changes. These are the current choices to
reproduce, not a requirement to configure every beta setting:

| Setting | Value | Why |
|---|---|---|
| Terminal font / default size | JetBrainsMono Nerd Font Mono, Regular / 18 pt | Matches other terminals/editors, including prompt icons. |
| Font smoothing / programming ligatures | On / on | Readable text and the font's programming glyphs. |
| Improve text contrast | On | Lifts hard-to-read text; turn off if exact program-authored colors are preferable. |
| Force theme palette for text | Off | Preserve Pi, Neovim, diffs, and other programs' RGB/256-color choices. |
| Display P3 colors | Off (sRGB) | Consistent interpretation of the shared hex palette. |
| Copy on select | Off | Selecting output should not replace clipboard text or images intended for an agent. |
| Autobalance splits | On | Evenly size panes when adding or closing them. |
| Focus follows mouse inside Rex | Off | Pointer movement should not steal keyboard focus. AeroSpace window focus is separate. |
| Terminal notifications (OSC 9/777) | On | Let programs report completion through native notifications. |
| Program Activity system notifications / extra sounds | On / off | Background-task alerts without Rex's additional activity sound. |

Notifications still need macOS permission and a program that reports activity
or emits notifications. This does not install hooks, guarantee Pi/Claude
reporting, or silence sounds configured in macOS. Avoid duplicate Herdr/Rex
notifications when nesting them.

### Optional command-line setup

These settings currently have no documented native Lua setters. The commands
below write individual macOS app preferences; they are **not** `init.lua`
configuration. Keys were inspected in Rex Beta 0.1.0 (build 1347), so review
them after upgrades and use Settings if a key changes.

**Fully quit Rex with `Cmd-Q` first**, then run the commands from **Ghostty or
another terminal**, not the Rex terminal being closed. Do not write them while
the app is running: its in-memory settings can overwrite the changes on exit.

If desired, save a private snapshot first; keep it out of Git because it can
contain local app metadata:

```bash
defaults export com.superlogical.rex \
  "$HOME/Downloads/rex-before-settings-$(date +%Y%m%d-%H%M%S).plist"
```

Apply the choices you want:

```bash
# Typography: default terminal family/size; choose Regular in Settings.
defaults write com.superlogical.rex Workspace.terminalFontName \
  -string 'JetBrainsMono Nerd Font Mono'
defaults write com.superlogical.rex Workspace.terminalFontPointSize -float 18
defaults write com.superlogical.rex Workspace.terminalFontSmoothing -bool true
defaults write com.superlogical.rex Workspace.terminalAllowsLigatures -bool true

# Readability without remapping Pi/Neovim/application colors.
defaults write com.superlogical.rex Workspace.terminalImproveTextContrast -bool true
defaults write com.superlogical.rex Workspace.terminalUseThemePalette -bool false
defaults write com.superlogical.rex Workspace.terminalUsesDisplayP3 -bool false

# Clipboard and pane behavior.
defaults write com.superlogical.rex Workspace.terminalCopyOnSelect -bool false
defaults write com.superlogical.rex Workspace.balancesSplitsOnCreation -bool true
defaults write com.superlogical.rex Workspace.focusFollowsMouse -bool false

# Background-task notifications without Rex's extra activity sound.
defaults write com.superlogical.rex Workspace.allowsTerminalNotifications -bool true
defaults write com.superlogical.rex Workspace.showsProgramActivityNotifications -bool true
defaults write com.superlogical.rex Workspace.playsProgramActivitySounds -bool false
```

Reopen Rex afterward. Reset pane-specific font zoom if it masks the default
size. Adjust or undo individual choices through Settings rather than replacing
the entire preference domain from a snapshot. Keep this guide in sync with
your preferred values; these commands are never run by Stow.

## What does config reload do?

Rex reads actions, keybindings, and host declarations from
`~/.config/rex/init.lua`. There is no `init.lua` in this package yet. If one is
added later, check and reload it with:

```bash
rex config check
rex --autostart=false config reload
```

Clients receive updated keys without restarting the server. This **does not**
re-import themes or apply the native preferences above:

- Theme change: re-import the file while Rex is open.
- Native preferences changed in Settings: Rex manages them directly.
- Native preferences changed with `defaults`: quit first, write, then reopen.
- `just stowall`: deploy files only; no automatic refresh or preference writes.

## Leave these app-managed for now

- Default shortcuts, tab placement, pane density, fading, and cursor behavior:
  try the defaults before adding bindings that might conflict with Neovim,
  Pi, or AeroSpace.
- Login shell and startup command: keep the default login shell so Zsh owns
  PATH, Starship, and initialization; do not auto-launch an agent in every pane.
- Link-opening trust, server exposure, remote hosts, and agent integrations:
  keep security-sensitive choices deliberate. No Rex skills/hooks are installed
  by this package, and existing Claude/Herdr integrations are unchanged.

## References and checks

- [Configuration file](https://www.superlogical.com/rex/docs/customize/config)
- [Lua API](https://www.superlogical.com/rex/docs/reference/lua)

Run `just doctor --only-check` for repository validation. Theme import,
preference application, font rendering, notifications, and pane behavior still
need an interactive check. Compare a fresh terminal and Neovim/Pi for readable
text, icons, selection contrast, and a yellow cursor.

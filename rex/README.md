# Rex configuration

This Stow package provides an importable classic **Gruvbox Dark Hard** theme
for [Rex](https://www.superlogical.com/rex/docs/). It matches the
[shared palette](../GRUVBOX.md), Ghostty's yellow cursor and dark selection,
and **JetBrainsMono Nerd Font Mono, 18 pt**. The font cask is already in
`Brewfile`.

The repository-local [`_scripts/rex-setup.lua`](../_scripts/rex-setup.lua)
provides explicit setup/refresh commands. It uses **native Rex client actions**
for themes and **`rex.exec`** only where the current Lua API has no settings
setter. Those fallbacks still call macOS `defaults`; using Lua does not make
native preferences disappear or turn private beta keys into a public API.

Neither the helper nor app preferences are Stow-deployed. Sessions, server
state, and mutable preferences remain app-owned. Ghostty's opacity, padding,
and shader settings are not part of the theme.

## Deploy and refresh

From the repository root:

```bash
just stowall
```

This links the theme to `~/.config/rex/themes/gruvbox-dark-hard`.
**Stow does not tell Rex to reload anything.** The helper stays under
`_scripts/`; run the following commands from this checkout, on the local Mac,
with the Rex CLI on PATH:

| Changed | Refresh |
|---|---|
| Theme file | With Rex open, run `rex --autostart=false do ./_scripts/rex-setup.lua mode=theme`. |
| Native setting values in the helper | Quit Rex, run the helper with `mode=apply` from Ghostty, then reopen Rex. |
| `init.lua` actions/keybindings, if added later | Check with `rex config check`, then run `rex --autostart=false config reload`. Clients receive updated keys; no server restart is needed. |
| Settings changed inside Rex | Use the app normally; reapplying the helper overwrites only its listed settings. |

There is no `init.lua` in this package yet. Do not `require` the setup helper
from one: setup must not run automatically on config reload.
**`rex config reload` does not refresh this package's theme or native settings.**

`rex do` requires a running local server even for the helper's subprocess-only
modes. Keep it running when quitting the app. If it is unavailable, start it
deliberately with Rex's normal `rex server start` command. The helper does not
start/stop servers, quit the app, install hooks, or change any sessions.

## Theme refresh through native Lua actions

With Rex open:

```bash
rex --autostart=false do ./_scripts/rex-setup.lua mode=theme
```

The helper checks that the deployed file exists, then calls
`rex.client.queue` with `client.appearance.switch_mode` and
`client.theme.import`. Importing **selects** the theme; Rex stores a copy and
does not watch the source file, so repeat this after editing it.

If several app clients are connected, use `rex client ls` and add
`-C <client-label-or-id>` before `do` to target the intended local app. The theme
path is a path on that Mac, not a remote server's filesystem.

Without the CLI, use Settings → Themes to import
`~/.config/rex/themes/gruvbox-dark-hard` as a Ghostty theme and select dark
appearance. Use `Cmd-Shift-G` in the file picker to enter the directory.

## Relevant settings without native Lua setters

The helper keeps these fallbacks explicit and limited:

| Setting | Value | Why |
|---|---|---|
| Terminal font / default size | JetBrainsMono Nerd Font Mono / 18 pt | Matches Ghostty and Zed, including prompt icons. |
| Font smoothing / programming ligatures | On / on | Readable text and the font's programming glyphs. |
| Improve text contrast | On | Lifts hard-to-read text; turn off in Settings if exact program-authored colors are preferable. |
| Force theme palette for text | Off | Preserve Pi, Neovim, diffs, and other programs' RGB/256-color choices. |
| Display P3 colors | Off (sRGB) | Consistent interpretation of the shared hex palette. |
| Copy on select | Off | Selecting output should not replace clipboard text or images intended for an agent. |
| Autobalance splits | On | Keep panes evenly sized when adding or closing them. |
| Focus follows mouse inside Rex | Off | Pointer movement should not steal keyboard focus. AeroSpace window focus is separate. |
| Terminal notifications (OSC 9/777) | On | Allow terminal programs to report completion through native notifications. |
| Program Activity system notifications / extra sounds | On / off | Background-task alerts without Rex's additional activity sound. |

Notifications still need macOS permission and a program that reports activity
or emits notifications. This does not install agent hooks, guarantee Pi/Claude
reporting, or silence sounds configured in macOS. Avoid duplicate Herdr/Rex
notifications when nesting them.

Preview is the default and makes no changes:

```bash
rex --autostart=false do ./_scripts/rex-setup.lua
# equivalent: add mode=preview
```

To apply, **fully quit Rex with `Cmd-Q`**, then use **Ghostty or another
terminal**, not the Rex terminal being closed:

```bash
rex --autostart=false do ./_scripts/rex-setup.lua mode=apply
```

The helper refuses to write while the Rex app is running. Each fallback uses
an argument array passed to `rex.exec`, not a shell command string, and stops
on a command failure. A failure can leave earlier settings applied; resolve
it and rerun, or adjust those settings in the app.

Reopen Rex, then run `mode=theme`. Choose the font's **Regular** face in
Settings if an existing style override is active, and reset pane-specific
font zoom if needed. The helper leaves UI fonts and unrelated settings alone.

There is no backup/restore framework. If you want a snapshot before applying,
export one yourself while Rex is quit:

```bash
defaults export com.superlogical.rex \
  "$HOME/Downloads/rex-before-setup-$(date +%Y%m%d-%H%M%S).plist"
```

Keep that private; it can include local app metadata. To undo individual
choices, use Settings rather than replacing the entire preference domain.
The fallback keys were inspected in Rex Beta 0.1.0 (build 1347); review them
after beta upgrades. They are not stable public Lua APIs.

## Keep these app-managed for now

- Default shortcuts, tab placement, pane density, fading, and cursor behavior:
  try Rex's defaults before adding bindings that could conflict with Neovim,
  Pi, or AeroSpace.
- Login shell and startup command: keep the default login shell so Zsh owns
  PATH, Starship, and initialization; do not auto-launch an agent in every pane.
- Link-opening trust, server exposure, remote hosts, and agent integrations:
  leave security-sensitive choices explicit. The helper does not install Rex
  skills/hooks or replace existing Claude/Herdr integrations.

## Checks and API references

- [Configuration file](https://www.superlogical.com/rex/docs/customize/config)
- [Lua API](https://www.superlogical.com/rex/docs/reference/lua)
- [Lua scripts and rex.exec](https://www.superlogical.com/rex/docs/automate/lua-scripts)

The helper's read-only preview was verified with the installed Rex CLI. Pure
Lua tests mock `rex.exec` and client actions, without changing host preferences:

```bash
luajit _scripts/tests/rex-setup.lua _scripts/rex-setup.lua
just doctor --only-check
```

Live theme import, preference application, font rendering, notifications, and
pane behavior still need an interactive check. After applying, check a fresh
terminal and Neovim/Pi for readable text, icons, and a yellow cursor. Rex owns
its UI chrome. If a saved selection-color override wins over the import,
adjust it in Terminal settings: background `#3c3836`, foreground `#fbf1c7`.

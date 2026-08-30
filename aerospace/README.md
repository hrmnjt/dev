# AeroSpace configuration

This is the permanent reference for my AeroSpace setup. The goal is predictable
window placement: jump directly to a workspace instead of hunting through
windows.

macOS Spotlight is the preferred app launcher. `cmd-tab` remains available as a
fallback, but the intended habit is workspace-first navigation.

## Where the config lives

AeroSpace supports XDG config, so this repo uses that instead of
`~/.aerospace.toml`:

```text
repo: aerospace/.config/aerospace/aerospace.toml
home: ~/.config/aerospace/aerospace.toml
```

Install the window-border helper and deploy from the repo root with:

```bash
cd ~/code/github.com/hrmnjt/dev
just brewinst
just stowall
```

Reload AeroSpace after ordinary configuration edits:

```text
option-shift-r
```

After installing JankyBorders for the first time, fully restart AeroSpace so its
startup command launches `borders`.

## Focused-window border

[JankyBorders](https://github.com/FelixKratz/JankyBorders) starts with AeroSpace
and makes the focused window visible at a glance. The tracked baseline uses:

- a 3-point rounded border
- Gruvbox bright yellow (`#fabd2f`) for the focused window
- translucent Gruvbox gray (`#665c54`) for inactive windows
- 10-point inner and outer AeroSpace gaps

The border process is launched by `after-startup-command` rather than as a
separate Homebrew service, keeping its lifecycle tied to AeroSpace. Running
`borders` again with different arguments updates the active process, which is
useful when tuning colors or width interactively.

## Shortcut notation

AeroSpace calls the Mac Option key `alt` in config. In this README:

```text
alt = option / opt / ⌥
```

So `alt-1` in the config means `option-1` on the keyboard.

## Workspace map

| Workspace | Shortcut | Intended home | Auto-moved apps |
| --- | --- | --- | --- |
| 1 | `option-1` | Ghostty / shell | Ghostty |
| 2 | `option-2` | notes / docs | Obsidian |
| 3 | `option-3` | browser | Brave, Safari |
| 4 | `option-4` | work comms | Microsoft Teams, Outlook PWA |
| 5 | `option-5` | spare / temporary | manual |
| 6 | `option-6` | email | Thunderbird |
| 7 | `option-7` | ad hoc personal project | manual |
| 8 | `option-8` | ad hoc personal project | manual |
| 9 | `option-9` | spare / temporary | manual |
| 10 | `option-0` | spare / temporary | manual |

## Main shortcuts

| Shortcut | Action |
| --- | --- |
| `option-1..9`, `option-0` | switch to workspace 1..10 |
| `option-tab` | toggle back to previous workspace |
| `option-shift-tab` | move the current workspace to the other monitor |
| `option-h/j/k/l` | focus left/down/up/right |
| `option-shift-h/j/k/l` | move focused window left/down/up/right |
| `option-shift-1..9`, `option-shift-0` | move focused window to workspace 1..10 |
| `option-f` | AeroSpace fullscreen/maximize |
| `option-shift-space` | toggle focused window between floating and tiled |
| `option-slash` | cycle tiled layout orientation |
| `option-comma` | cycle accordion layout orientation |
| `option-shift-r` | reload config |

Prefer `option-f` over the green macOS fullscreen button.

## Two-display workflow

The external BenQ is a 22-inch portrait display, while the MacBook Pro screen is
the high-resolution primary working display. Because neither display should own a
fixed set of workspaces forever, the config intentionally does **not** force
workspaces onto monitors.

Use this instead:

```text
option-shift-tab
```

That moves the current workspace to the next monitor. With two displays, it means
“send this whole workspace to the other screen.” Good candidates for the portrait
monitor are Teams/Outlook, Thunderbird, Obsidian, docs, logs, or reference
browser windows.

Avoid adding `[workspace-to-monitor-force-assignment]` unless a workspace truly
must always live on one display; forced assignments make
`move-workspace-to-monitor` ineffective for those workspaces.

## Resizing

Current resize bindings:

| Shortcut | Action |
| --- | --- |
| `option-minus` | smart resize smaller |
| `option-equal` | smart resize larger |
| `option-r`, then `h/j/k/l` | resize with vim directions |
| `enter` or `esc` | leave resize mode |

Trackpad resizing is still fine when it is faster; keyboard resizing is available
for deliberate layout adjustments.

## App routing notes

The pattern for routing an app is:

1. Open the app.
2. Run:

   ```bash
   aerospace list-apps
   ```

3. Copy the app id into an `on-window-detected` rule in
   `aerospace/.config/aerospace/aerospace.toml`.
4. Reload with `option-shift-r`.

Current important rules:

- Ghostty -> workspace 1
- Obsidian -> workspace 2
- Brave -> workspace 3
- Safari -> workspace 3
- Microsoft Teams -> workspace 4
- Outlook Brave PWA -> workspace 4
- Thunderbird -> workspace 6

Thunderbird compose/send windows have a best-effort floating rule based on window
title. If a Thunderbird dialog still tiles, inspect it with:

```bash
aerospace list-windows --format '%{app-name} | %{window-title}'
```

Then update the `if.window-title-regex-substring` matcher.

## Floating exceptions

Some windows are better floating: settings windows, file pickers, small dialogs,
copy/paste helpers, VPN windows, and one-off utility apps.

Current floating rules include:

- Finder
- App Store
- WhatsApp
- System Settings
- Pulse Secure / Ivanti-style VPN window
- Windows App remote desktops
- Thunderbird compose/send windows, when title matching catches them

Use `option-shift-space` for one-off floating/tiling toggles.

## Visual tuning to consider later

The 3-point border and 10-point gaps are the initial visual baseline. After using
them on both displays, possible refinements are:

- Try 12-point gaps, or per-monitor gaps if the portrait display needs a
  different density.
- Switch the active border from bright yellow to Gruvbox aqua if yellow feels
  too prominent.
- Adjust inactive-border opacity if it is distracting or too difficult to see.
- Increase `accordion-padding` if accordion mode needs more visible context.

Change one variable at a time after the two-display workflow feels natural.

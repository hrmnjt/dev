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

Deploy from the repo root with:

```bash
cd ~/code/github.com/hrmnjt/dev
just stowall
```

Reload AeroSpace after editing:

```text
option-shift-r
```

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
| 2 | `option-2` | editor | Zed |
| 3 | `option-3` | browser | Brave |
| 4 | `option-4` | work comms | Microsoft Teams, Outlook PWA |
| 5 | `option-5` | notes / docs | Obsidian |
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
| `option-enter` | open a new Ghostty window |
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
- Zed -> workspace 2
- Brave -> workspace 3
- Microsoft Teams -> workspace 4
- Outlook Brave PWA -> workspace 4
- Obsidian -> workspace 5
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
- Thunderbird compose/send windows, when title matching catches them

Use `option-shift-space` for one-off floating/tiling toggles.

## Aesthetic improvements to consider later

The current gaps and layout are intentionally practical. Possible future tweaks:

- Increase gaps from `8` to `10` or `12` if the layout feels cramped.
- Use per-monitor gaps if the portrait display needs different spacing.
- Increase `accordion-padding` if accordion mode needs more visible context.
- Add a small shell/notes cheatsheet if any shortcuts still need reinforcement.

Do these only after the two-display workflow feels natural.

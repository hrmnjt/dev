# AeroSpace configuration

Predictable window placement: jump directly to a workspace instead of hunting
through windows. The tracked `aerospace.toml` is heavily commented and is the
source of truth for bindings, gaps, and app routing rules; this README only
covers what the config cannot show. In the config, `alt` means the Option key.

## Where the config lives

AeroSpace supports XDG config, so this repo uses that instead of
`~/.aerospace.toml`:

```text
repo: aerospace/.config/aerospace/aerospace.toml
home: ~/.config/aerospace/aerospace.toml
```

Install and deploy from the repository root:

```bash
just brewinst
just stowall
```

Reload after edits with `option-shift-r`. After installing JankyBorders for the
first time, fully restart AeroSpace so its startup command launches it.

## Focused-window border

[JankyBorders](https://github.com/FelixKratz/JankyBorders) starts with AeroSpace
and marks the focused window at a glance. The tracked baseline:

- 3-point rounded border, Gruvbox bright yellow (`#fabd2f`) for focus
- translucent Gruvbox gray (`#665c54`) for inactive windows
- launched by `after-startup-command` rather than a separate Homebrew service,
  keeping its lifecycle tied to AeroSpace

Re-running `borders` with different arguments updates the live process, which
is handy when tuning colors or width interactively.

## Status bar

The workspace indicator is AeroSpace's own menu bar item; everything else in
the top bar is the native macOS menu bar: Wi-Fi, VPN, battery, clock, and
application menus.

The tray item can be restyled from AeroSpace's menu under **Experimental UI
Settings (No stability guarantees)**. The intended style is **"i3 style
ordered"**: one keycap per workspace that has windows, the focused one filled,
empty workspaces hidden, with a `|` separator per monitor. The choice is stored
in the app's `UserDefaults` (not in the tracked config) and must be re-picked
on a new machine. It is experimental upstream and may change between versions.

macOS reserves the top menu-bar region, so the normal 10-point AeroSpace gap
provides separation below it.

## Two displays

`option-shift-tab` sends the whole current workspace to the other monitor
(MacBook Pro + portrait BenQ). Neither display owns a fixed set of workspaces.

Avoid `[workspace-to-monitor-force-assignment]` unless a workspace truly must
live on one display; forced assignments make `move-workspace-to-monitor`
ineffective for those workspaces.

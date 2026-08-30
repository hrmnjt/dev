# SketchyBar configuration

This package provides a small Gruvbox status bar that complements AeroSpace. It
is intentionally an initial baseline rather than a framework or a large
collection of third-party plugins.

## Current bar

Left side:

- Apple logo, matching the visual anchor of the native menu bar
- AeroSpace workspaces 1–10 in an Omarchy-inspired treatment
  - yellow block: focused
  - gray block: occupied
  - muted number: empty
- focused application name

Right side:

- Ivanti VPN state; aqua lock while connected, muted when down
- Wi-Fi state; yellow phone icon and "Hotspot" label while on Personal Hotspot;
  click it to open Wi-Fi settings
- battery state and percentage
- date and time; click it to open Calendar

The bar itself is borderless and transparent; only the workspace blocks carry
backgrounds, and the right-side indicators render as flat text and icons. It
appears on every display and reserves the notch region on the built-in
display. The configuration uses the tracked JetBrains Mono Nerd Font and classic
Gruvbox colors.

## Install and deploy

From the repository root on the host Mac:

```bash
just brewinst
just stowall
```

SketchyBar starts with AeroSpace. Fully restart AeroSpace after the first
installation, or launch the bar once with:

```bash
sketchybar
```

Reload the tracked configuration after edits with:

```bash
sketchybar --reload
```

The scripts under `.config/sketchybar/plugins/` must remain executable.

## Native macOS menu bar

Set **System Settings → Control Center → Automatically hide and show the menu
bar** to **Always**. The native menu bar still exists for application menus and
can be revealed at the top edge.

Use `Option-Shift-B` to hide or show SketchyBar before accessing the native menu
bar without overlap. The tracked Apple logo is decorative; SketchyBar does not
replace the native Apple menu or application menus such as File, Edit, and View.

No Ice or Thaw installation is needed. The Wi-Fi and VPN indicators are shell
scripts rather than SketchyBar aliases: macOS 26+ moved native status-item
ownership to Control Centre and `CGWindowListCreateImage` returns blank for
third-party items, so aliases cannot capture them. The scripts need no Screen
Recording permission. Two tunables live in the plugin scripts:

- `HOTSPOT_PATTERN` in `plugins/wifi.sh` — matches the iPhone's name as SSID
  (default: `iPhone`)
- `IVANTI_ROUTE_MARKER` in `plugins/vpn.sh` — optional; by default the check
  treats a default route over a `utun` interface as connected

## AeroSpace integration

AeroSpace starts SketchyBar and emits `aerospace_workspace_change` whenever the
focused workspace changes. SketchyBar also refreshes occupancy when applications
or native Space windows change. macOS reserves the menu-bar region, and the
normal 10-point AeroSpace top gap separates tiled windows from the bar.

## Next evaluation

Use this baseline on both the MacBook and portrait display before adding more
items. Useful remaining candidates are Focus, microphone, and screen-recording
state. A compact calendar popup can replace Itsycal only after it proves
reliable; do not remove Itsycal merely because a clock is present.

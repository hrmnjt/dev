# SketchyBar configuration

This package provides a small Gruvbox status bar that complements AeroSpace. It
is intentionally an initial baseline rather than a framework or a large
collection of third-party plugins.

## Current bar

Left side:

- AeroSpace workspaces 1–10
  - yellow: focused
  - gray: occupied
  - muted number: empty
- focused application name

Right side:

- battery state and percentage
- date and time; click it to open Calendar

The bar appears on every display and reserves the notch region on the built-in
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
bar without overlap. SketchyBar does not replace application menus such as File,
Edit, and View.

No Ice or Thaw installation is needed. Native status-item aliases are omitted
from this baseline; adding aliases later would require Screen Recording
permission.

## AeroSpace integration

AeroSpace starts SketchyBar and emits `aerospace_workspace_change` whenever the
focused workspace changes. SketchyBar also refreshes occupancy when applications
or native Space windows change. Tiled windows stay below the bar through
AeroSpace's larger top gap.

## Next evaluation

Use this baseline on both the MacBook and portrait display before adding more
items. Useful candidates are VPN, Focus, microphone, and screen-recording state.
A compact calendar popup can replace Itsycal only after it proves reliable; do
not remove Itsycal merely because a clock is present.

# AeroStatus

A tiny repository-owned Swift utility that shows AeroSpace workspaces in the
**native macOS menu bar**. It replaces the SketchyBar workspace strip while
leaving Wi-Fi, VPN, battery, clock, and application menus fully native and
interactive.

```text
AeroSpace workspace change
        │  (exec-on-workspace-change)
        ▼
aerostatus --notify <workspace>
        │  (Unix socket)
        ▼
native menu-bar item:  1  2  ▐3▌  ▐6▌  9  10
```

## Display

- focused workspace: yellow block with dark text (`#fabd2f` / `#1d2021`)
- occupied workspace: gray block with muted text (`#3c3836` / `#a89984`)
- empty workspace: muted text only (`#7c6f64`)
- click a workspace to switch to it (`aerospace workspace <name>`)
- occupancy is reconciled every 60 seconds as a safety net

The app runs as an accessory (`NSStatusItem`), needs no Accessibility or Screen
Recording permission, and only shells out to the existing `aerospace` CLI.

## Build and install

Requires Xcode Command Line Tools (provides `swift`). From the repository root:

```bash
just aerostatus
```

This builds `_aerostatus/` in release mode and installs the binary to
`~/.local/bin/aerostatus`. AeroSpace then starts it via
`after-startup-command` and notifies it via `exec-on-workspace-change`
(see `aerospace/.config/aerospace/aerospace.toml`).

After installing, fully restart AeroSpace so the startup command launches it:

```bash
aerospace reload-config
pkill AeroSpace; open -a AeroSpace
```

## Communication

`exec-on-workspace-change` invokes the installed binary with `--notify`, which
connects to the running instance's socket at `/tmp/aerostatus.$UID.sock` and
delivers the new workspace name. If the app is not running, the notify call
exits silently; the next 60-second reconcile picks up the state once it starts.

## Files

```text
_aerostatus/
├── Package.swift
└── Sources/aerostatus/
    ├── main.swift               # entry point + --notify mode
    ├── AppDelegate.swift        # NSApplication glue
    ├── StatusController.swift   # NSStatusItem ownership + refresh loop
    ├── WorkspaceStripView.swift # custom-drawn workspace strip
    ├── AerospaceClient.swift    # aerospace CLI wrapper
    └── SocketServer.swift       # Unix socket server + notify client
```

## Relationship to SketchyBar

The SketchyBar configuration remains in the repository (`sketchybar/`) but is
no longer started by AeroSpace. If you want the old bar back temporarily, swap
the `after-startup-command` entry back to `exec-and-forget sketchybar` and
restore the SketchyBar `exec-on-workspace-change` trigger.

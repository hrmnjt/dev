# ivanti config

Terminal-based VPN control via AppleScript menu bar automation. Ivanti has
no CLI on macOS — the script does programmatically what you'd otherwise do
with repeated clickops.

## Configuration

```
ivanti/
└── .local/bin/
    ├── vpn     # AppleScript-driven VPN control script
    ├── vc      # vpn connect
    ├── vd      # vpn disconnect
    ├── vs      # vpn suspend
    ├── vr      # vpn resume
    └── vst     # vpn status
```

The script clicks the Ivanti menu bar icon, reads available menu items to
detect state (connected/suspended/disconnected), and clicks the right action
in a **single menu interaction**. Uses `killall "System Events"` between
operations to avoid AppleScript hangs (macOS respawns it immediately — safe).

## What this enables

```bash
vpn connect     # or: vc    — connect (resumes if suspended)
vpn disconnect  # or: vd    — full disconnect
vpn suspend     # or: vs    — keep session, block traffic
vpn resume      # or: vr    — resume from suspend
vpn status      # or: vst   — show current state
```

No opening the app window. No hunting through the menu bar dropdown.

## Dependencies

- macOS (AppleScript)
- Ivanti Secure Access Client installed and running
- Accessibility permission for the app running `vpn` (System Settings → Privacy & Security → Accessibility)
  - This is per app. If you switch terminal apps, grant the new terminal app too.
  - Granting Accessibility to AeroSpace does **not** grant it to your terminal.
- `IVANTI_VPN_NAME` env var set to your VPN connection name

## Alternatives & tradeoffs

| Approach | Pro | Con |
|----------|-----|-----|
| GUI (default) | Always works | Clickops every time; slow |
| This script | Fast, terminal-native | Breakable by Ivanti UI changes; relies on AppleScript |
| Ivanti CLI tools | Official support | Not available on macOS (Windows/Linux only) |
| OpenConnect alternative | Open source, no vendor lock-in | May not support all auth methods the org uses |

The script can break if Ivanti renames menu items or restructures the menu
bar dropdown. When that happens, the fix is adjusting the AppleScript menu
navigation paths.

## Troubleshooting after AeroSpace or terminal changes

AeroSpace itself does not control the VPN. The common failure is macOS TCC
permissions: the script uses AppleScript UI automation, and Accessibility is
checked against the app that launched `osascript`.

If `vpn status` stops working after adopting AeroSpace or changing terminal apps:

1. Open System Settings → Privacy & Security → Accessibility.
2. Enable the exact app where you run `vpn` (`Ghostty` or Terminal).
3. If prompted under Privacy & Security → Automation, allow that app to control
   System Events / Ivanti Secure Access.
4. Run `vpn status` again. The script now prints AppleScript errors instead of
   failing silently.

If Ivanti login/dialog windows get tiled oddly by AeroSpace, find the bundle id
with `aerospace list-apps | grep -i ivanti` and add a floating rule in
`aerospace/.config/aerospace/aerospace.toml`.

## Usage

```bash
stow -t ~ ivanti
```

Ensure `~/.local/bin` is in `$PATH` and set the VPN connection name:

```bash
export IVANTI_VPN_NAME="DOH VPN"
```

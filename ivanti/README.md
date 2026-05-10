# ivanti config

Terminal-based VPN control via AppleScript menu bar automation. Ivanti has
no CLI on macOS — the script does programmatically what you'd otherwise do
with repeated clickops.

## Configuration

```
ivanti/
└── .local/bin/vpn     # AppleScript-driven VPN control script
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
- Accessibility permission for your terminal app (System Settings → Privacy & Security → Accessibility)
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

## Usage

```bash
stow -t ~ ivanti
```

Ensure `~/.local/bin` is in `$PATH` and set up zsh aliases:

```bash
export IVANTI_VPN_NAME="DOH VPN"
alias vc="vpn connect"
alias vd="vpn disconnect"
alias vs="vpn suspend"
alias vr="vpn resume"
alias vst="vpn status"
```

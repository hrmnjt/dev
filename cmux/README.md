# cmux config

Agent multiplexer for running AI coding agents in parallel.
Replacing Ghostty as my primary terminal for agent workflows.

## Theme

Gruvbox Dark Hard color palette applied to workspace colors and sidebar:
- Workspace selection: `#504945` (Gruvbox bg2)
- Notification badges: `#FE8019` (Gruvbox orange)
- Sidebar tint: `#504945` (matches Gruvbox dark background)
- Workspace colors use Gruvbox palette where it makes sense

Note: cmux doesn't control terminal font/color themes like Ghostty does.
The terminal colors inside panes come from the shell (starship + macOS profile).
To fully match Ghostty's "Gruvbox Dark Hard", make sure your macOS terminal
profile or shell sets matching ANSI colors.

## Key decisions

- **Appearance: dark** — matches Gruvbox Dark Hard vibe
- **Telemetry off** — opted out of anonymous telemetry
- **SSH hidden** — don't use SSH workspaces in sidebar
- **Cursor & Gemini off** — only using Claude Code integration
- **Browser intercept on** — links from terminals open in cmux's built-in browser
- **Copy on select** — matches Ghostty muscle memory
- **matchTerminalBackground** — sidebar blends with terminal background
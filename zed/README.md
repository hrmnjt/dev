# Zed configuration

This package contains the personal Zed editor settings.

```text
zed/.config/zed/settings.json -> ~/.config/zed/settings.json
```

The configuration uses the Gruvbox Material Dark Hard theme, JetBrains Mono
Nerd Font, Vim mode, 80/120-column wrap guides, and matching editor and terminal
font sizes. Telemetry is disabled, CLI opens create new windows, and worktrees
are trusted automatically.

Install and deploy from the repository root:

```bash
just brewinst
just stowall
```

Zed normally reloads settings after the file changes; restart it if a setting is
not applied immediately.

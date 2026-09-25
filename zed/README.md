# Zed configuration

This package contains the personal Zed editor settings.

```text
zed/.config/zed/settings.json -> ~/.config/zed/settings.json
```

The configuration uses Zed's built-in classic Gruvbox Dark Hard theme (no
extension required), JetBrains Mono Nerd Font, Vim mode, 80/120-column wrap
guides, and matching editor and terminal font sizes. Telemetry is disabled,
CLI opens create new windows, and worktrees are trusted automatically.

Install and deploy from the repository root:

```bash
brew bundle install
just stowall
```

Zed normally reloads settings after the file changes; restart it if a setting is
not applied immediately.

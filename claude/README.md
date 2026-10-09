# Claude Code

Homebrew installs Claude; Stow manages one global Mac configuration. Native
`AGENTS.md` provides project instructions—no wrapper needed. Use v2.1.281+.

## Setup

Quit Claude, compare existing files, and back up **only conflicting files**.
Keep credentials, installed plugins, and generated hooks host-local. Do not use
`stow --adopt`, restore the old tldraw allow list, or copy old sandbox policies.

Run on the Mac from this repository:

```bash
brew bundle install
stow --no-folding --simulate --verbose -t ~ claude
just stowall
claude doctor
```

Use plain `claude` in a narrow feature worktree. Global settings are defaults:
review project/local `.claude` settings, including main-checkout local settings
for linked worktrees. Ignored settings will not appear in `git status`.

Optional higher-priority policy, using the same file:

```bash
claude --settings "$HOME/.claude/settings.json"
```

On v2.1.285+, this prevents repository settings from loosening the Bash sandbox;
organization-managed settings still take precedence.

## Preferences

- **Opus**, with saved `xhigh` effort for `claude-opus-5-5`.
- Native **Gruvbox Dark Hard**; Ghostty owns the terminal background.
- Frontend-design plugin, Remote Control mobile notifications, and the existing
  Herdr `SessionStart` hook.
- Host personal/work Git identity, fail-closed if missing; no Mac attribution.
  Existing `GIT_CONFIG_*` injections must be merged with the configured entries.

Herdr's generated script stays at `~/.claude/hooks/herdr-agent-state.sh`. If
missing, run `herdr integration install claude` and review its settings edits.
Retaining integrations is not an audit: hooks/plugins/MCP are trusted code
outside the Bash sandbox.

## Safety and checks

Local edits/tests/commits are autonomous. Outside reads are blocked; Bash requires
the native sandbox, without exclusions or unsandboxed retries. Do not widen access
to unblock commands. SSH remote operations stay with you. Instructions against
publication/destructive shared-state changes are not enforcement; workspace
secrets are not isolated.

Run `just doctor --only-check` here and `just doctor` on the Mac. In a fresh
session inspect `/sandbox`, `/permissions`, `/memory`, `/theme`, `/model`, `/effort`,
`/plugin`, and Herdr state. Restart once after creating the themes folder.
Verify Git author/committer, linked-worktree commits, and disposable outside-read/
write denials. Configuration checks do not prove live behavior.

## Web sessions

claude.ai does not inherit Mac settings. Set `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`,
`GIT_COMMITTER_NAME`, and `GIT_COMMITTER_EMAIL` in a reusable cloud environment
from `git/.config/git/config.personal`; use a separate work environment. Optionally
install the personal `CLAUDE.md` via its setup script. Start fresh and verify
identity. Mac attribution settings do not apply on the web.

References: [settings](https://code.claude.com/docs/en/settings),
[custom themes](https://code.claude.com/docs/en/terminal-config#create-a-custom-theme),
[palette](../GRUVBOX.md), [web environments](https://code.claude.com/docs/en/cloud-environments).

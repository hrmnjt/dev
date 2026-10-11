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
- Remote Control mobile notifications and the existing Herdr `SessionStart` hook.
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
and Herdr state. Restart once after creating the themes folder.
Verify Git author/committer, linked-worktree commits, and disposable outside-read/
write denials. Configuration checks do not prove live behavior.

## Web sessions

Cloud environments belong to your account, not Stow; reuse them on a new Mac.
At [claude.ai/code](https://claude.ai/code), open the cloud selector above the
message box → **Cloud → Add cloud environment** if they do not exist:

- `hrmnjt-personal`: use the name/email from `git/.config/git/config.personal`.
- `hrmnjt-work`: use `git/.config/git/config.work`, only for authorized work repos.
- In each environment, set `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`,
  `GIT_COMMITTER_NAME`, and `GIT_COMMITTER_EMAIL`; start with **Trusted** networking.
  Do not set these identity variables globally in your Mac shell.
- On each Mac, use `/remote-env` in Claude to select the CLI cloud default;
  select the appropriate environment separately for browser sessions.

Use the environment's **Setup script** to install personal instructions in
`~/.claude/CLAUDE.md`: read repository `AGENTS.md` before editing, verify branch
naming, and use the explicitly requested branch for both pushing and the PR head.
Merge these with existing personal instructions rather than overwriting them.
They are reminders, not enforcement; Mac settings/attribution do not carry over.

For each new task, request a compliant branch explicitly (in this repo,
`<type>/<scope>/<short-kebab-description>`, e.g. `fix/meta/review-followups`).
A generated `claude/...` branch is not an exception. If the cloud workflow blocks
using the requested branch, stop and report rather than silently falling back.
Verify the actual PR head; a local rename does not change an existing PR.

Start a fresh session, check `/context` for loaded instructions, and verify
`git branch --show-current`, `git var GIT_AUTHOR_IDENT`, and
`git var GIT_COMMITTER_IDENT` before edits/commits. Existing commits are unchanged.

References: [settings](https://code.claude.com/docs/en/settings),
[custom themes](https://code.claude.com/docs/en/terminal-config#create-a-custom-theme),
[palette](../GRUVBOX.md), [web environments](https://code.claude.com/docs/en/cloud-environments).

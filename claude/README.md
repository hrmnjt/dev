# Claude Code in Gondolin

Typed `claude` starts Claude Code pinned **inside the guest image**. See
[shared setup and branch trials](../gondolin/README.md). The Homebrew Mac CLI and
desktop app stay installed with their own settings; see [Mac CLI](#mac-cli).
The image builds and the live VM fixture passes; this candidate still requires
real-CLI acceptance before deployment.

## Configuration

Stow deploys `claude/.config/agent-vm/claude/` to
`~/.config/agent-vm/claude/`. Bypass settings never reach the host's `~/.claude`,
so the Mac CLI cannot inherit this VM policy.

The shared launcher copies only tracked settings, instructions and theme bytes
into a read-only guest provider. No Mac Claude credentials, plugins, hooks,
sessions or configuration directory are mounted.

- Runs as UID 1000 with `--dangerously-skip-permissions`.
- Permission mode `bypassPermissions`; nested Claude Bash sandboxing is off
  because Gondolin is the boundary.
- Opus and the saved `claude-opus-5-5/xhigh` preference are retained.
- Gruvbox Dark Hard, even after `just theme nord`: the managed settings fix
  the theme, and the tracked Nord theme is ready for a launcher change that
  follows the switch ([Nord](../NORD.md)).
- No Claude Git attribution. Remote Control and its push
  notifications need a full-scope `/login` token; `setup-token` tokens are
  inference-only, so they are not configured. Use Claude Code on the web instead.
- Per-project state is seeded past first-run onboarding, and
  `skipDangerousModePermissionPrompt` skips the bypass-mode confirmation.
  Claude's folder-trust dialog still appears once per new worktree path.
- Claude's built-in `--worktree` writes under `.claude/worktrees/`, which is
  read-only in the VM; create worktrees with the Rex shortcuts instead.
- Auto-updates disabled; upgrades mean pin bumps, image rebuild and acceptance.
- No host command hooks. Native OSC 7501 goes directly through the
  PTY to Rex; no host RPC/socket access is given to the guest.
- Global settings/instructions/themes are read-only. Runtime history and memory
  live in a separate per-primary-project `claude-state` directory, shared across
  that project's worktrees. Workspace `.claude` trees remain read-only.

## Use

```bash
claude
claude --resume
claude --preview 3000
claude setup-token
```

`setup-token` is the one explicit exception for credential setup: a throwaway VM
with no host mounts or supplied tokens, not a login in the work VM. Open its URL on
the Mac yourself; put the resulting token and actual expiry into Keychain Access
as described in the shared guide. Never run `claude login` in a work VM.

Inside a session, edits, commits, branch pushes and PR creation operate on the
live worktree. GitHub uses the scoped placeholder token and HTTPS, with no SSH
agent. The user reviews and merges under an enforced main-branch ruleset.
`Ctrl+V` uses the images-only host proxy; Playwright/Chromium and opt-in ingress
are provided by the shared image. These actual CLI workflows still need a host trial.

Sessions and memory live in
`~/.local/state/agent-vm/<project key>/claude/home/claude-state`, shared by the
project's worktrees; `claude --resume` lists only those. A Mac CLI session from
before the migration still resumes on the Mac with `/opt/homebrew/bin/claude
--resume`. To continue one in the VM, copy it from its worktree; the worktree path,
and so Claude's project folder name, is the same in the VM. Try one session first;
the Mac copy is left unchanged:

```bash
enc=$(printf %s "$PWD" | sed 's/[^A-Za-z0-9]/-/g')
ls -t ~/.claude/projects/$enc/*.jsonl | head
key=$(printf %s "$(realpath "$(git rev-parse --path-format=absolute --git-common-dir)")" | shasum -a 256 | cut -c1-24)
dest=~/.local/state/agent-vm/$key/claude/home/claude-state/projects/$enc
mkdir -p "$dest" && cp ~/.claude/projects/$enc/<id>.jsonl "$dest"/
claude --resume <id>
```

The VM has no Mac MCP servers, plugins or hooks, files outside the worktree, or
Mac-built binaries such as `.venv`.

## Mac CLI

Homebrew still installs the Mac CLI (`claude-code`) and the desktop app
(`claude`). Stow deploys `claude/.claude/` to `~/.claude/` for that CLI only; the
VM never reads it. Typed `claude` goes to the VM, so start the Mac CLI by path:

```bash
/opt/homebrew/bin/claude
/opt/homebrew/bin/claude doctor
```

- Opus, with saved `xhigh` effort for `claude-opus-5-5`.
- Auto permission mode by default (`permissions.defaultMode: "auto"`), using
  Claude Code's classifier for approval decisions rather than bypassing checks.
- Native Gruvbox Dark Hard; Ghostty owns the terminal background. The Nord
  theme is listed in `/theme`, but choosing it writes through the Stow link
  into the tracked `settings.json`.
- Host personal/work Git identity with `user.useConfigOnly`, no attribution,
  Remote Control mobile notifications and Rex's `SessionStart` hook.
- Outside-read blocking and mandatory Bash sandboxing, without exclusions or
  unsandboxed retries. Hooks/plugins/MCP are outside the Bash sandbox.

The retired Herdr `SessionStart` entry in `claude/.claude/settings.json` still
needs a deliberate host edit; this tree is read-only in the VM. Keep Rex's hook.

Retiring the Mac CLI or desktop app is a separate later decision, not part of
this migration.

## Web sessions

Claude Code on the web remains a complement for phone, browser and unattended
work. Configure reusable account-scoped environments at
[claude.ai/code](https://claude.ai/code), independently of this VM:

| Environment | Identity source |
| --- | --- |
| `hrmnjt-personal` | `git/.config/git/config.personal` |
| `hrmnjt-work` | `git/.config/git/config.work` |

Set `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME` and
`GIT_COMMITTER_EMAIL` explicitly there. Web environments do not inherit Mac
path-based identity or local VM settings/themes. Provide personal instructions in
the environment setup when needed; use the repository's shared `AGENTS.md`.
Check `git var GIT_AUTHOR_IDENT`/`GIT_COMMITTER_IDENT` rather than rewriting old
commits. An explicit branch name follows this repo's Conventional Commit-style
branch naming; names are not enforcement.

References: [devcontainer](https://code.claude.com/docs/en/devcontainer),
[settings](https://code.claude.com/docs/en/settings),
[terminal config](https://code.claude.com/docs/en/terminal-config),
[cloud environments](https://code.claude.com/docs/en/cloud-environments).

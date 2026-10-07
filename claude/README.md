# Claude Code

Tracked user configuration for [Claude Code](https://code.claude.com/docs).
Homebrew installs the CLI through the `claude-code` cask in the `Brewfile`,
and Stow deploys this package into `~/.claude`.

## Layout

```text
claude/
└── .claude/
    ├── CLAUDE.md          # Personal instructions loaded in every project
    ├── settings.json      # Permission mode, sandbox, Git identity, and hooks
    └── hooks/
        └── uv-guard.sh    # Block pip/poetry/venv in favor of uv
```

`--no-folding` keeps `~/.claude` a real directory, so Claude Code can write its
runtime state beside the links. Only the three files above are tracked. These
stay host-local and untracked:

- `~/.claude.json` — sign-in session, MCP servers, project trust, and the
  global options that `/config` writes
- `~/.claude/projects/`, `history.jsonl`, `todos/`, `backups/`, and other
  session state
- `~/.claude/hooks/herdr-agent-state.sh`, written by Herdr's integration
- `.claude/settings.local.json` in any repository

## Install

On the host Mac, from the repository root:

```bash
brew bundle install
just stowall
claude            # first run opens the browser sign-in
claude doctor     # read-only install and settings diagnostics
```

Stow does not replace existing files. If `~/.claude/settings.json` or
`~/.claude/CLAUDE.md` already exists, move it aside first and merge anything
worth keeping into this package.

The `claude-code` cask follows the stable channel (about a week behind
`latest`, without releases that had major regressions). Homebrew installs do not
update themselves:

```bash
brew upgrade --cask claude-code
```

To follow the `latest` channel, replace the cask with `claude-code@latest` in
the `Brewfile`.

## Permission mode

Sessions start in auto mode (`defaultMode: "auto"`): a classifier reviews
actions before they run instead of asking. Manual mode (`default`) asks before
every file edit and most commands, which makes sandboxed work feel like a
prompt for everything. The `ask` rules still prompt in auto mode, keeping
Homebrew, Stow, launchd, `defaults`, and `sudo` with the user.

Auto mode needs a supported model. When it is unavailable, a session starts in
Manual mode; switch with `Shift+Tab` or start with
`claude --permission-mode auto`.

Error reporting is off. Telemetry stays on because `DISABLE_TELEMETRY` also
turns off feature-flag fetching, which disables claude.ai skill and plugin
sync, artifact comments, and `/auto-mode-setup`.

## Sandbox

Claude Code follows the same boundary as Pi's native sandbox: real host paths,
confined writes, and normal Git, network, and CLI use. Its macOS (Seatbelt)
sandbox wraps every Bash command:

- Writes are limited to the working directory, a per-user temp directory, and
  directories added with `/add-dir`. In a linked worktree, such as a Herdr
  workspace, commands can also update the main checkout's shared `.git`, except
  its `hooks/` and `config`. Sandboxed commands run without a prompt.
- `failIfUnavailable` makes Claude Code refuse to start rather than run
  unsandboxed.
- Network access goes through the sandbox proxy. GitHub, npm, and PyPI hosts
  are pre-allowed; in auto mode a command names any other host it needs and the
  classifier reviews it, without a prompt.
- `credentials` hides SSH keys, the `gh` token file, Pi's `auth.json`, and the
  Hugging Face token from sandboxed commands. The matching `Read(...)` deny
  rules cover Claude's built-in file tools, which run outside the sandbox.
- Two kinds of command run outside the sandbox, reviewed by auto mode's
  classifier: `git fetch`, `git pull`, and `git push`, because Git over SSH
  cannot authenticate through the proxy on macOS; and `gh`, whose TLS
  verification fails under Seatbelt.
- Claude Code's own configuration, including `~/.claude` and `.claude`
  directories, is protected. Sandboxed commands cannot write it, and edits to
  this package's settings from a Claude session always prompt.

Hooks, the status line, and MCP servers run outside the sandbox with full user
access. Keep them small and reviewed. Run `/sandbox` to inspect the sandbox's
state.

To confirm the boundary after deployment, ask Claude to run both commands. Each
should fail:

```text
touch ~/sandbox-probe
curl --noproxy '*' https://example.com
```

## Git identity

The `env` block sets `user.useConfigOnly=true` for every command Claude Code
starts, as Pi's native sandbox does. Commits under the path rules in
[Git](../git/README.md) use the selected identity, and linked worktrees inherit
their primary repository's identity. Anywhere else, Git refuses to commit
rather than inventing a name and address from the host. `just doctor
--only-check` tests this.

## Herdr

In a Herdr worktree, Claude Code keys workspace trust and "Yes, and don't ask
again" approvals on the main checkout, so new worktrees reuse what the primary
repository already allows. The default-tabs plugin starts Pi; run `claude` from
the `shell` tab.

Herdr's integration reports Claude's state and restores its sessions:

```bash
herdr integration install claude
herdr integration status
```

It writes `~/.claude/hooks/herdr-agent-state.sh` and adds one `SessionStart`
hook to `settings.json`. Herdr follows the Stow link, so the hook lands in
`claude/.claude/settings.json` with the absolute path to your home directory.
Review and commit that change once. Reinstalling on a Mac with the same home
path changes nothing; a different home path adds a second entry.

## uv guard

`hooks/uv-guard.sh` is a `PreToolUse` hook that ports Pi's `uv.ts` guard. It
blocks `pip`, `pip3`, `poetry`, `python -m pip`, `python -m venv`, and
`python -m py_compile` at the start of a shell segment, and sends uv
alternatives back to Claude. It is invoked through `/bin/sh`, so the Stow link
does not depend on the file's executable mode. `just doctor --only-check` runs
its regression cases.

## Editing settings

`~/.claude/settings.json` is a link into this repository. Changes that Claude
Code or Herdr make there, such as rules added through `/permissions`, show up
in `git status`. Commit them or revert them. If an update ever replaces the
link with a regular file, `just doctor` reports a missing Stow link. Move the
useful changes back into `claude/.claude/settings.json`, delete the file, and
run `just stowall`.

Project-specific rules belong in each repository's `.claude/settings.json`, not
here.

## Attribution

`attribution` turns off the `Co-authored-by` commit trailer, the "Generated
with Claude Code" pull request line, and the session link that cloud sessions
add to commits. Cloud sessions on claude.ai do not read `~/.claude`, so this
repository's own `.claude/settings.json` repeats the same setting for them.

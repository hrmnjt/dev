# Claude Code

Tracked user configuration for [Claude Code](https://code.claude.com/docs).
Homebrew installs the CLI through the `claude-code` cask in the `Brewfile`,
and Stow deploys this package into `~/.claude`.

## Layout

```text
claude/
└── .claude/
    ├── CLAUDE.md          # Personal instructions loaded in every project
    ├── settings.json      # Permissions, sandbox, telemetry, and hooks
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
- `.claude/settings.local.json` in any repository

## Install

On the host Mac, from the repository root:

```bash
brew bundle install
just stowall
claude            # first run opens the browser sign-in
claude doctor     # read-only install and settings diagnostics
```

The `claude-code` cask follows the stable channel (about a week behind
`latest`, without releases that had major regressions). Homebrew installs do not
update themselves:

```bash
brew upgrade --cask claude-code
```

To follow the `latest` channel, replace the cask with `claude-code@latest` in
the `Brewfile`.

## Sandbox and permissions

Unlike Pi, Claude Code does not run in Gondolin. It runs on the host at the real
checkout path. Its own macOS (Seatbelt) sandbox enforces the boundary for Bash
commands:

- Writes are limited to the working directory, a per-user temp directory, and
  any directories added with `/add-dir`. Sandboxed commands run without a prompt
  (`autoAllowBashIfSandboxed`).
- Network access goes through the sandbox proxy. The first connection to a new
  host prompts.
- `failIfUnavailable` makes Claude Code refuse to start rather than run
  unsandboxed. This is the same fail-closed stance as the Gondolin setup.
- `credentials` hides SSH keys, the `gh` token file, Pi's `auth.json`, and the
  Hugging Face token from sandboxed commands. The matching `Read(...)` deny
  rules cover Claude's built-in file tools, which run outside the sandbox.
- On macOS, Git over SSH cannot authenticate through the sandbox proxy, so
  `git fetch`, `git pull`, and `git push` are excluded from the sandbox. Pushes
  still prompt through the `ask` rule.
- Homebrew, Stow, launchd, `defaults`, and `sudo` always prompt, matching the
  repository rule that host-mutating operations stay with the user.

If a command fails inside the sandbox, Claude may ask to rerun it unsandboxed.
The prompt is titled **Bash command (unsandboxed)**. Decline it unless you
expected that command to need host access. Run `/sandbox` to inspect the
sandbox's state.

Hooks, the status line, and MCP servers run outside the sandbox with full user
access. Keep them small and reviewed.

To confirm the boundary after deployment, ask Claude to run both commands. Each
should fail:

```text
touch ~/sandbox-probe
curl --noproxy '*' https://example.com
```

## uv guard

`hooks/uv-guard.sh` is a `PreToolUse` hook that ports Pi's `uv.ts` guard. It
blocks `pip`, `pip3`, `poetry`, `python -m pip`, `python -m venv`, and
`python -m py_compile` at the start of a shell segment, and sends uv
alternatives back to Claude. It is invoked through `/bin/sh`, so the Stow link
does not depend on the file's executable mode. `just doctor --only-check` runs
its regression cases.

## Editing settings

`~/.claude/settings.json` is a link into this repository. Changes that Claude
Code makes there, such as rules added through `/permissions`, show up in
`git status`. Commit them or revert them. If an update ever replaces the link
with a regular file, `just doctor` reports a missing Stow link. Move the useful
changes back into `claude/.claude/settings.json`, delete the file, and run
`just stowall`.

Project-specific rules belong in each repository's `.claude/settings.json`, not
here.

## Attribution

`attribution` turns off the `Co-authored-by` commit trailer, the "Generated
with Claude Code" pull request line, and the session link that cloud sessions
add to commits. Cloud sessions on claude.ai do not read `~/.claude`, so this
repository's own `.claude/settings.json` repeats the same setting for them.

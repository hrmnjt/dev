# Agent instructions

This is a personal macOS dotfiles repository. Before changing anything, read the
root `README.md` and the README for the relevant package. Keep this file focused
on instructions that add to those guides rather than repeating them.

## Execution environment

Deployed Pi filesystem/shell tools use the native macOS sandbox with real host
paths and launch-directory-confined writes. Private scratch and this checkout's
Git metadata are explicit exceptions; use bash Git commands, not direct file edits
in `.git`. Networking and CLI authentication remain available. `!` and `!!` remain
unsandboxed host commands.
Leave Homebrew, Stow deployment, launchd, VPN, and local-LLM operations to the
user. A development harness may expose a different tool cwd/environment;
honor that rather than assuming host paths. See **Native sandbox** in `pi/README.md`.

Claude Code runs on the host Mac with its own native Bash sandbox, or in a
claude.ai cloud environment; Pi's tool policy does not apply to Claude. See
`claude/README.md` for global settings, shared `AGENTS.md` support, and web Git
identity setup. The same deliberate-user rule applies to Mac deployment and
service operations.

## Git workflow

Use Conventional Commits-style names when asked to create branches or commits:

- Branch: `<type>/<scope>/<short-kebab-description>`
- Commit: `<type>(<scope>): <short imperative summary>`

Common scopes are `pi`, `nvim`, and `meta`; for example,
`docs/pi/update-readme` and `docs(pi): update setup notes`.

Do not add a fallback Git identity. Identity selection must remain fail-closed,
and linked worktrees must inherit the identity of their primary repository.

## Changelog

For every change, check whether an entry in the root `README.md` changelog
already exists. If it does, make sure the entry matches what the change
actually does. If it does not, add one.

## Pi development

Before modifying Pi extensions, themes, skills, prompts, keybindings, models,
SDK integrations, or TUI components, read the relevant installed Pi documentation
completely, follow its cross-references, and inspect applicable installed examples.
`/sandbox` reports the paths (normally under
`/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/`).

Design Pi changes toward these goals:

- Keep the configuration small, focused, terminal-native, and self-contained.
- Prefer official Pi APIs and focused extensions over parallel frameworks or
  external services.
- Keep model-facing filesystem/shell tools behind the native sandbox. Avoid
  new host-side escape hatches; when one is necessary, make it narrow, explicit,
  and user-approved.
- Track intentional configuration while keeping mutable runtime state
  Git-ignored.
- Preserve native launch-directory write confinement, host-shell separation,
  linked-worktree Git metadata access, and fail-closed Git identity. Use normal
  bash Git/network commands when requested. Do not add offline mode, read-only
  Git, or Pi-source locks as part of this migration. Stow-linked Pi source is
  editable when inside the launch boundary; changes affect new/reloaded sessions.
- Use `ctx.shutdown()` for exit; never call `process.exit()`.
- Prefer imports from `@earendil-works/pi-coding-agent` and
  `@earendil-works/pi-tui` for new code.
- Ask the user to test interactive commands and TUI behavior that cannot be
  validated in the development sandbox.

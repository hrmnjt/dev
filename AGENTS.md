# Agent instructions

This is a personal macOS dotfiles repository. Before changing anything, read the
root `README.md` and the README for the relevant package. Keep this file focused
on instructions that add to those guides rather than repeating them.

## Execution environment

The target deployment uses Gondolin as the shared sandbox. Pi's interface and
provider/OAuth connection stay on the Mac; its model filesystem/shell tools run
only in the VM. Claude Code and Amp run entirely in separate session VMs; their
Mac commands are launchers, not host agent installs. Pi's user `!`/`!!` remain
host commands. See `gondolin/README.md` and the agent package guides.

The complete worktree and linked common Git directory are mounted at the same
absolute paths. Use ordinary bash Git commands; identity is selected from the
primary repository, with no fallback. Host-backed `.pi`, `.claude`, Git hooks,
VM launcher/config sources and guest global Git config are read-only. Never
bypass those protections; ask for a deliberate host edit when needed.
`.git/config` stays writable, with the documented host-hook/config execution risk.
Tokens are host Keychain values substituted for guest placeholders; no SSH agent
or arbitrary host environment is forwarded. The internet is open, but Mac/private
services are blocked except the narrow images-only clipboard and Pi tldraw bridges.

Homebrew, Stow, live npm installs, image builds, Keychain, GitHub rulesets,
launchd, VPN and local-model services remain deliberate user steps. Do not merge
or deploy before host VM acceptance. This worktree/harness may still have the
previous native sandbox loaded; honor its actual tools and boundary, never route
blocked writes through host services. Claude/Amp cloud sessions remain separate;
see `claude/README.md` for web Git identity.

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
Inside the VM, installed Pi docs/examples are mounted at `/pi/docs` and
`/pi/examples`; `/gondolin` reports the active VM/workspace. Host SDK paths vary
with the Pi installation; use the actual harness paths when developing.

Design Pi changes toward these goals:

- Keep the configuration small, focused, terminal-native, and self-contained.
- Prefer official Pi APIs and focused extensions over parallel frameworks or
  external services.
- Keep model-facing filesystem/shell tools inside Gondolin, including nested
  and codemode calls. Never fall back to host execution. Avoid new host-side
  escape hatches; any exception must be narrow, explicit and user-approved.
- Track intentional configuration while keeping mutable runtime state
  Git-ignored.
- Preserve host-shell separation, same-path worktree/common-Git mounts,
  fail-closed identity and normal guest Git/network operations. Do not add
  offline mode or read-only repository Git config. Protect host-executable
  agent configuration, Git hooks and global guest Git config at the provider
  boundary, not with model instructions alone. Keep the main checkout's live
  Stow effects explicit; protected Pi-source edits require a user host step.
- Use `ctx.shutdown()` for exit; never call `process.exit()`.
- Prefer imports from `@earendil-works/pi-coding-agent` and
  `@earendil-works/pi-tui` for new code.
- Ask the user to test interactive commands and TUI behavior that cannot be
  validated in the development sandbox.

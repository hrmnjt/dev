# Agent instructions

This is a personal macOS dotfiles repository. Before changing anything, read the
root `README.md` and the README for the relevant package. Keep this file focused
on instructions that add to those guides rather than repeating them.

## Execution environment

Assistant tools run in Gondolin at `/workspace`; `!` and `!!` run on the host,
so leave Homebrew, Stow deployment, launchd, VPN, and local-LLM operations to the
user. See the **Gondolin sandbox** section in `pi/README.md`.

## Git workflow

Use Conventional Commits-style names when asked to create branches or commits:

- Branch: `<type>/<scope>/<short-kebab-description>`
- Commit: `<type>(<scope>): <short imperative summary>`

Common scopes are `pi`, `nvim`, and `meta`; for example,
`docs/pi/update-readme` and `docs(pi): update setup notes`.

Do not add a fallback Git identity inside Gondolin. Identity selection must
remain fail-closed, and linked worktrees must inherit the identity of their
primary repository.

## Pi development

Before modifying Pi extensions, themes, skills, prompts, keybindings, models,
SDK integrations, or TUI components, read the relevant files under `/pi/docs`
completely, follow their cross-references, and inspect applicable examples under
`/pi/examples`.

Design Pi changes toward these goals:

- Keep the configuration small, focused, terminal-native, and self-contained.
- Prefer official Pi APIs and focused extensions over parallel frameworks or
  external services.
- Keep model-facing tools inside Gondolin. Avoid new host-side escape hatches;
  when one is necessary, make it narrow, explicit, and user-approved.
- Track intentional configuration while keeping mutable runtime state
  Git-ignored.
- Preserve Gondolin's workspace isolation, host-shell separation, SSH bridge,
  linked-worktree support, and fail-closed Git identity behavior.
- Use `ctx.shutdown()` for exit; never call `process.exit()`.
- Prefer imports from `@earendil-works/pi-coding-agent` and
  `@earendil-works/pi-tui` for new code.
- Ask the user to test interactive commands and TUI behavior that cannot be
  validated inside Gondolin.

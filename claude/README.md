# Claude Code in Gondolin

Claude Code is pinned **inside the guest image**, not installed on the Mac.
`claude` is a VM launcher. See [shared setup and branch trials](../gondolin/README.md).
The image builds and the live VM fixture passes; this candidate still requires
real-CLI acceptance before deployment.

## Configuration

Stow deploys `claude/.config/agent-vm/claude/` to
`~/.config/agent-vm/claude/`. It deliberately does **not** deploy bypass settings
to the host's `~/.claude`: a legacy Mac CLI must never inherit this VM policy.

The shared launcher copies only tracked settings, instructions and theme bytes
into a read-only guest provider. No Mac Claude credentials, plugins, hooks,
sessions or configuration directory are mounted.

- Runs as UID 1000 with `--dangerously-skip-permissions`.
- Permission mode `bypassPermissions`; nested Claude Bash sandboxing is off
  because Gondolin is the boundary.
- Opus and the saved `claude-opus-5-5/xhigh` preference are retained.
- Gruvbox Dark Hard and no Claude Git attribution. Remote Control and its push
  notifications need a full-scope `/login` token; `setup-token` tokens are
  inference-only, so they are not configured. Use Claude Code on the web instead.
- Per-project state is seeded past first-run onboarding, and
  `skipDangerousModePermissionPrompt` skips the bypass-mode confirmation.
  Claude's folder-trust dialog still appears once per new worktree path.
- Claude's built-in `--worktree` writes under `.claude/worktrees/`, which is
  read-only in the VM; create worktrees with the Rex shortcuts instead.
- Auto-updates disabled; upgrades mean pin bumps, image rebuild and acceptance.
- Host Herdr/Rex command hooks removed. Native OSC 7501 goes directly through the
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

## Retire Mac agents after acceptance

Do not uninstall anything until the VM's authentication, image paste, status,
history/memory, preview, commit/push/PR and clean shutdown have passed on the Mac.
Then quit old Mac CLI sessions and run these yourself in a host terminal:

```bash
brew uninstall --cask claude-code
# No documented setting was found that disables all local desktop Code sessions.
# The chosen fail-closed option is to remove the app, not assume they are disabled.
brew uninstall --cask claude
```

The candidate Brewfile no longer installs either cask; editing it does not
uninstall existing applications. Web chat remains available. Do not run blanket
Brew cleanup. If Claude was installed another way, inspect/remove that install
yourself, then confirm `whence -a claude` shows only the function/VM wrapper you
intend. Remove only dangling old Stow links during [Pi deployment](../pi/README.md#deploy);
leave existing credentials/runtime data alone. Existing Mac sessions are not
stopped or migrated automatically.

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

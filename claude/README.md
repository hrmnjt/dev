# Claude Code

Homebrew installs the CLI with `cask "claude-code"`. Stow deploys personal
instructions and settings into `~/.claude`; this repository also commits
project settings for claude.ai web sessions.

## Files and scope

| File | Scope |
|---|---|
| `claude/.claude/settings.json` | User settings on the Mac |
| `claude/.claude/CLAUDE.md` | Personal instructions on the Mac |
| `.claude/settings.json` at the repository root | This repository, local and web |
| `CLAUDE.md` at the repository root | Imports `AGENTS.md` and adds Claude-specific guidance |
| `_scripts/claude-web-git-identity.sh` | Web-only SessionStart hook for this repository |

Web sessions do **not** read the Mac's `~/.claude` files. The root project
settings are separate from the Stow package; they must be committed to the
branch the web session clones. Do not Stow the root `.claude` directory.

## Install on the Mac

Run these on the host, not from an agent sandbox:

```bash
brew bundle install
# Preview deployment first, especially if Claude has existing user settings:
stow --no-folding --simulate --verbose -t ~ claude
just stowall
claude
claude doctor
```

If existing `~/.claude/settings.json` or `~/.claude/CLAUDE.md` files conflict,
back them up and merge useful preferences into the tracked files before removing
the conflicting originals and rerunning Stow. Do not use `stow --adopt` blindly.
`--no-folding` keeps `~/.claude` a real directory with only intentional files
symlinked; credentials, `~/.claude.json`, history, projects, and other runtime
state remain outside the repository. `.claude/settings.local.json` is also
untracked via the global Git ignore rule.

Homebrew installations are updated through Homebrew:

```bash
brew upgrade --cask claude-code
```

Edits made by `/config` or `/permissions` to the symlinked user settings can
change tracked files. Review `git diff` before keeping them. If Claude replaces
a link with a regular file, merge the changes back and restow.

## Mac sandbox and Git identity

Claude runs on the host, **not** in Gondolin. User settings enable its native
sandbox, require sandbox availability, and automatically allow sandboxed Bash
commands. Permission mode stays `default`; this slice does not enable auto mode
or bypass permissions. Homebrew, Stow, launchd, defaults mutations, sudo, and
Git pushes have explicit ask rules.

Git fetch/pull/push are excluded from the native sandbox for SSH authentication;
permission checks still apply. Review any request to run other commands
unsandboxed. Hooks and built-in file tools are not confined by the Bash sandbox;
these settings are not a Gondolin-equivalent VM boundary.

On the Mac, Git continues using the existing personal/work `includeIf` rules
and linked worktrees inherit their primary repository's identity. The user
settings inject `user.useConfigOnly=true` into Claude's Git commands so unknown
paths cannot silently use a guessed identity. They do not set a name or email.
The `GIT_CONFIG_COUNT` block reserves slot 0; if you already inject Git config
through these variables, merge the entries rather than replacing them.

Before committing, check from the **Claude Bash tool**, not just another shell:

```bash
git config --show-origin --get user.name
git config --show-origin --get user.email
git var GIT_AUTHOR_IDENT
git var GIT_COMMITTER_IDENT
```

Inherited `GIT_AUTHOR_*` or `GIT_COMMITTER_*` variables override Git config.
Remove stale overrides from the launching environment; do not ask the agent to
invent an identity or bypass the check.

## Web-session identity

PR #194's commits use `Claude <noreply@anthropic.com>` as both author and
committer. Attribution settings only control message trailers and PR footers;
they do **not** change either Git identity.

The project SessionStart hook exits without changes on the Mac. When
`CLAUDE_CODE_REMOTE=true`, it:

1. Reads `user.name` and `user.email` from `git/.config/git/config.personal`
   (currently `hrmnjt <harman@hrmnjt.dev>`), without duplicating those values.
2. Sets that identity and `user.useConfigOnly=true` in **this checkout's local
   Git config**, never a global cloud fallback.
3. Appends safely quoted `GIT_AUTHOR_*` and `GIT_COMMITTER_*` exports to
   `CLAUDE_ENV_FILE`, overriding cloud defaults for subsequent Bash commands.

The hook runs on startup, resume, and other SessionStart events, including
compaction. It requires a valid repository root, the tracked identity file,
and Claude's environment file. A SessionStart hook error does not itself block
Claude from working; `CLAUDE.md` instructs the agent to stop before committing
if identity setup or verification fails. This is workflow configuration, not
a tamper-proof enforcement layer.

Start a **new single-repository web session** on a branch containing these
files. Run the identity checks above inside that session before its first
commit. After an authorized commit, verify both fields:

```bash
git show -s --format='Author: %an <%ae>%nCommitter: %cn <%ce>%n%B' HEAD
```

Cloud sessions with several repositories do not load individual repositories'
project settings/hooks. They need a separately reviewed cloud-environment
setup; this hook deliberately does not impose a personal identity on other
repositories or work projects. Other personal repositories need their own
explicit identity setup, not a copy of the Mac's path-based rules.

## Attribution and existing commits

Both user and project settings use:

```json
"attribution": {
  "commit": "",
  "pr": "",
  "sessionUrl": false
}
```

`commit` and `pr` are strings, not booleans. Empty strings suppress the Claude
co-author trailer and PR footer; `sessionUrl: false` suppresses the cloud
session link. Project settings ensure this also applies on the web.

This affects **future** commits; it does not rewrite PR #194. To preserve your
identity without rewriting that published branch, squash-merge as yourself
and remove any Claude co-author trailer from GitHub's suggested message.
Rewriting all existing authors/committers would require a separate explicit
history-rewrite decision and force push.

## Validation

```bash
python3 _scripts/tests/test_claude.py
just doctor --only-check
```

The isolated tests exercise local no-op behavior, web author and committer
selection despite Claude environment overrides, linked worktrees, invalid
configuration, shell-safe quoting, settings, and Stow deployment. Test the
actual interactive sandbox and a fresh web session after deployment; a local
fixture cannot prove how the hosted service applies settings.

References: [settings](https://code.claude.com/docs/en/settings),
[attribution](https://code.claude.com/docs/en/settings-reference#attribution),
[cloud settings and hooks](https://code.claude.com/docs/en/cloud-environments#what-carries-over-from-your-setup),
[SessionStart environment persistence](https://code.claude.com/docs/en/hooks#persist-environment-variables).

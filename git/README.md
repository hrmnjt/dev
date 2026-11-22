# git config

Layered git config with path-based identity switching via `includeIf`.
Instead of a single `.gitconfig` with a hardcoded identity, the main config
conditionally includes identity files based on where the repo lives on disk.

## Configuration

```
git/
└── .config/git/
    ├── config            # Global defaults + includeIf rules
    ├── config.personal   # [user] name=hrmnjt email=harman@hrmnjt.dev
    ├── config.work       # [user] name=Harmanjeet Singh Nagi email=hanagi@doh.gov.ae
    └── ignore            # Global gitignore (macOS junk, vim swaps, Claude local settings)
```

**config** sets `init.defaultBranch = main`, prunes deleted remote-tracking
branches whenever Git fetches, requires pulls to fast-forward, enables `rerere`,
uses `zdiff3` conflict markers, and applies these host identity rules:

```ini
[includeIf "gitdir:~/code/github.com/hrmnjt/"]
    path = ~/.config/git/config.personal
[includeIf "gitdir:~/code/work/"]
    path = ~/.config/git/config.work
```

The Gondolin launcher keeps these host path rules but reads only the selected
name/email from the identity file into a read-only guest global config. Selection
uses the canonical common Git directory, so linked worktrees inherit the primary
repository's identity even when their checkout is elsewhere. Unknown paths get
no identity, with `user.useConfigOnly=true` and no fallback. The complete worktree
and linked common directory are mounted at the same absolute paths. Use ordinary
guest Bash Git commands for status, staging, commits, fetch and push.

GitHub SSH remotes are rewritten to HTTPS in the guest, using the scoped
Keychain-backed token placeholder; no host SSH agent is forwarded. Host SSH/gh
configuration stays unchanged. Hooks and the guest global config are read-only;
repo `.git/config` is writable, including the accepted `core.hooksPath` risk when
host Git later runs. See [shared policy and GitHub rulesets](../gondolin/README.md).
This candidate requires VM acceptance before deployment.

## Pull behavior

The tracked defaults make a plain pull equivalent to using `--prune --ff-only`:

```bash
git pull
```

`fetch.prune = true` removes stale remote-tracking branches during the fetch
stage, while `pull.ff = only` refuses a pull that would create a merge commit.
Git still updates only the current branch from its configured upstream.

## Global ignores

`ignore` excludes macOS junk, Vim swap files, and
`**/.claude/settings.local.json`. Claude Code may create that optional file
when saving project-specific permissions; keep these machine-local exceptions
out of commits across all repositories. This rule does not ignore the shared
`.claude/settings.json` or the Stow-managed user settings.

`**/.claude/.cc-writes/` also excludes local Claude scratch output at any
repository depth. Keep this disposable state out of commits without ignoring
the rest of a project's `.claude/` directory.

## GitHub SSH setup

`./_scripts/sshsetup.sh` (from the repository root) creates or reuses the dated
GitHub key, adds a managed Keychain preference block without replacing existing
host identities, and reuses a reachable SSH agent (including an empty one).
A private agent is started only when the existing one cannot be reached.
An existing key can be selected with `./_scripts/sshsetup.sh /path/to/key`;
its public half must also exist.

The helper runs on the Mac and changes SSH configuration/Keychain state.
Existing `IdentityFile` entries remain unchanged; their key choice may need
adjustment when generating a new key. Real authentication/reboot behavior is
separate from the disposable script checks.

## Deploy

```bash
just stowall
```

To verify: `git config --list --show-origin` from a personal and work repo.

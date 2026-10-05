# git config

Layered git config with path-based identity switching via `includeIf`.
Instead of a single `.gitconfig` with a hardcoded identity, the main config
conditionally includes identity files based on where the repo lives on disk.

## Configuration

```
git/
└── .config/git/
    ├── config            # Global defaults + includeIf rules
    ├── config.personal   # [user] name=harmanjeet email=harman@hrmnjt.dev
    ├── config.work       # [user] name=Harmanjeet Singh Nagi email=hanagi@doh.gov.ae
    └── ignore            # Global gitignore (macOS junk and vim swaps)
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

Pi's native sandbox uses real host paths and the same Git configuration; there
is no guest-path identity rewrite or fallback identity. Linked worktrees inherit
the identity of their primary repository through Git's common-directory rules.
Unknown paths have no selected identity; sandboxed commands set
`user.useConfigOnly=true`, so Git cannot invent one. Use ordinary bash Git
commands for status, staging, commits, fetch, and push when requested, not direct
file edits in `.git`. Git metadata is a writable exception when outside the launch
directory (including linked worktrees and launches from a subdirectory); arbitrary
primary-checkout source remains outside the boundary. New worktree/clone locations
must be inside the write boundary or created deliberately on the host.

## What this enables

Never think about identity again. `git commit` in `~/code/github.com/hrmnjt/*`
always uses personal email. In `~/code/work/*` it always uses work email.
No per-repo config, no forgotten `git config user.email` after a re-clone.

## Alternatives & tradeoffs

| Approach | Pro | Con |
|----------|-----|-----|
| Per-repo `git config user.email` | No global config needed | Must remember every re-clone; easy to forget |
| Single `.gitconfig` with one identity | Simplest | Wrong identity in half your repos |
| Conditional includes (this) | Set once, always correct | Must maintain directory conventions |
| Separate macOS user accounts | Total isolation | Heavy; switching users is painful |

The directory convention (`~/code/github.com/hrmnjt/` vs `~/code/work/`) is
the only ongoing cost, and it's already enforced by how I organize repos.

## Pull behavior

The tracked defaults make a plain pull equivalent to using `--prune --ff-only`:

```bash
git pull
```

`fetch.prune = true` removes stale remote-tracking branches during the fetch
stage, while `pull.ff = only` refuses a pull that would create a merge commit.
Git still updates only the current branch from its configured upstream.

## Deploy

```bash
just stowall
```

To verify: `git config --list --show-origin` from a personal and work repo.

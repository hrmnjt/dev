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
    └── ignore            # Global gitignore (macOS junk, direnv, vim swaps)
```

**config** sets `init.defaultBranch = main`, `rerere.enabled = true`,
`merge.conflictStyle = zdiff3`, and these host identity rules:

```ini
[includeIf "gitdir:~/code/github.com/hrmnjt/"]
    path = ~/.config/git/config.personal
[includeIf "gitdir:~/code/work/"]
    path = ~/.config/git/config.work
```

Gondolin does not use a tracked `/workspace/` identity rule because every host
repository is mounted at that same guest path. Instead, the pi Gondolin
extension resolves the host checkout's primary repository path and generates a
VM-specific Git config with the matching personal or work identity. Unknown
host paths remain fail-closed, so commits fail rather than using the wrong
identity. Linked worktrees inherit the identity of their primary repository.

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

## Deploy

```bash
stow -t ~ git
```

To verify: `git config --list --show-origin` from a personal and work repo.

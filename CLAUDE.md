@AGENTS.md

## Claude Code

Claude Code runs on the host Mac or in a claude.ai cloud VM, not in Pi's
Gondolin sandbox. See `claude/README.md` for settings and Git identity setup;
leave Mac deployment and service operations to the user.

Use the configured Git author and committer without `--author`, `git -c user.*`,
or author/committer environment overrides. In web sessions, the SessionStart
hook selects this personal repository's identity from
`git/.config/git/config.personal`. If the hook reports an error or
`git var GIT_AUTHOR_IDENT` / `git var GIT_COMMITTER_IDENT` doesn't match that
file, stop before committing and report the problem. Do not fall back to Claude.

Do not add Claude co-author, generated-by, or session-link attribution.

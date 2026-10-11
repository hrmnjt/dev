# Claude Code

Homebrew installs Claude; Stow manages global Mac settings, personal instructions,
and the Gruvbox theme. Project instructions come from native `AGENTS.md`.

## Mac setup

```bash
brew bundle install
stow --no-folding --simulate --verbose -t ~ claude
just stowall
claude doctor
```

Existing files can conflict with Stow; individual backups leave credentials and
runtime state intact. Plain `claude` loads global settings, which project/local
settings can override. Optional `claude --settings "$HOME/.claude/settings.json"`
gives the same file higher priority; organization-managed settings still win.

## Configuration

- Opus, with saved `xhigh` effort for `claude-opus-5-5`.
- Native Gruvbox Dark Hard; Ghostty owns the terminal background.
- Host personal/work Git identity, no Mac attribution, Remote Control mobile
  notifications, and Herdr's generated `~/.claude/hooks/herdr-agent-state.sh`.
- Outside-read blocking and mandatory Bash sandboxing, without exclusions or
  unsandboxed retries. Hooks/plugins/MCP are outside the Bash sandbox; workspace
  secrets and remote-service effects are not isolated by filesystem confinement.

`just doctor` and `claude doctor` cover setup checks. `/sandbox`, `/permissions`,
`/memory`, and `/theme` expose session configuration; checks alone do not prove
live enforcement.

## Web sessions

Cloud environments are account-scoped and reusable across Macs. They are managed
at [claude.ai/code](https://claude.ai/code), in the cloud selector above the
message box → **Cloud → Add cloud environment**.

| Environment | Identity source |
|---|---|
| `hrmnjt-personal` | `git/.config/git/config.personal` |
| `hrmnjt-work` | `git/.config/git/config.work` |

Each uses `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, and
`GIT_COMMITTER_EMAIL`. The selected identity applies to every repo in the session,
not Mac path rules. `/remote-env` selects the CLI cloud default on each Mac;
browser sessions have their own environment selector.

Mac settings and attribution do not carry over. An environment's **Setup script**
can supply personal `~/.claude/CLAUDE.md` instructions; `/context` lists loaded
instructions. `git var GIT_AUTHOR_IDENT` and `git var GIT_COMMITTER_IDENT` show
current identities, without changing existing commits.

Cloud sessions may start on generated `claude/...` branches. An explicit branch
name helps align work with `AGENTS.md` conventions; naming instructions are not
enforcement. The PR head is separate from a local branch rename.

References: [settings](https://code.claude.com/docs/en/settings),
[palette](../GRUVBOX.md), [web environments](https://code.claude.com/docs/en/cloud-environments).

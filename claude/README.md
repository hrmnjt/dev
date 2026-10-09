# Claude Code

Homebrew installs the CLI with `cask "claude-code"`. Stow deploys **one global
Mac settings file**, `claude/.claude/settings.json`, to
`~/.claude/settings.json`, plus personal instructions in `~/.claude/CLAUDE.md`.
Both apply across repositories; no per-repository settings or hooks are needed.

Root `CLAUDE.md` only imports repository instructions and clarifies Claude's
execution environment. It is not a second personal settings file.

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
state remain outside the repository.

Claude may create `.claude/settings.local.json` when saving project-specific
permissions. It is optional, not a file to maintain in every repository.
`git/.config/git/ignore` excludes it globally to prevent accidental commits,
without ignoring the tracked user settings.

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
commands. Permission mode stays `default`; this setup does not enable auto mode
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
Remove stale overrides from the Mac's launching environment; do not ask the
agent to invent an identity or bypass the check.

## Reusable claude.ai web environment

Web sessions do **not** inherit the Mac's user settings, instructions, or Git
config. Claude does not automatically synchronize a single personal JSON
settings file between your Mac and hosted sessions. Use a reusable cloud
environment for web Git identity instead of committing settings to every repo.

At [claude.ai/code](https://claude.ai/code), create or edit a personal cloud
environment and select it for sessions across your personal repositories.
In its **Environment variables** field, set all four Git identity variables.
Generate the values from the tracked personal config on the Mac:

```bash
# From this repository's root; this only prints configuration for the web UI.
name=$(git config --file git/.config/git/config.personal --get user.name)
email=$(git config --file git/.config/git/config.personal --get user.email)
printf 'GIT_AUTHOR_NAME=%s\nGIT_AUTHOR_EMAIL=%s\nGIT_COMMITTER_NAME=%s\nGIT_COMMITTER_EMAIL=%s\n' \
  "$name" "$email" "$name" "$email"
```

Paste the output into the environment's variables field, not into a repository.
The current identity is `hrmnjt <harman@hrmnjt.dev>`. Environment variables
override `user.name` / `user.email`, including a VM's Claude defaults.
Do not set these globally in your Mac shell, where they would override the
personal/work path rules.

Use a **separate work cloud environment** with the work identity if needed.
Every repository in a cloud session uses the selected environment's identity;
a mixed personal/work multi-repository session is therefore inappropriate.
This is an explicit environment identity, not a path-based cloud fallback.
If the tracked identity changes, update the web environment manually.

### Personal web instructions

Optionally add this to the cloud environment's **Setup script** field to give
sessions personal instructions without committing them to each repository:

```bash
mkdir -p "$HOME/.claude"
cat > "$HOME/.claude/CLAUDE.md" <<'EOF'
Use the configured Git author and committer; do not override them or use --author.
Verify git var GIT_AUTHOR_IDENT and git var GIT_COMMITTER_IDENT before committing.
If either identity is missing or unexpected, stop and ask the user.
Use Conventional Commits and do not push or open PRs unless asked.
Do not add Claude co-author, generated-by, or session-link attribution.
EOF
```

These are instructions, **not** equivalent to enforced JSON attribution
settings. The Mac's attribution configuration does not apply on the web, and
a cloud environment is not a universal replacement for every JSON setting.
Organization-level server-managed settings, where available, provide a
different policy mechanism.

Start a **fresh session using that environment** after configuration. Verify
both effective identities from its Bash tool before authorizing a commit:

```bash
git var GIT_AUTHOR_IDENT
git var GIT_COMMITTER_IDENT
# After an authorized commit:
git show -s --format='Author: %an <%ae>%nCommitter: %cn <%ce>%n%B' HEAD
```

For web instructions, also check `/context` lists the user `CLAUDE.md` under
Memory files. Existing sessions may retain old environment values until their
VM is restored or rebuilt; starting fresh avoids relying on that timing.
Hosted behavior needs checking in a real session, not just a local fixture.

## Attribution and existing commits

The global Mac settings use empty strings for `attribution.commit` and
`attribution.pr`, and `false` for `attribution.sessionUrl`. The first two
are strings, not booleans. They suppress Claude's commit co-author trailer,
PR footer, and session link on the Mac.

Attribution settings do **not** change author or committer identity. PR #194's
existing Claude-authored commits are not rewritten by this setup. To preserve
your identity without rewriting that published branch, squash-merge as yourself
and remove any Claude co-author trailer from GitHub's suggested message.
Rewriting existing authors/committers requires a separate explicit decision
and force push.

## Validation

Run `just doctor --only-check` for JSON, Git configuration, and isolated Git
identity checks. Host `just doctor` also checks expected commands and Stow links.
Test the interactive sandbox and web identity using the steps above after
deployment; there is no custom hook requiring a dedicated regression suite.

References: [settings](https://code.claude.com/docs/en/settings),
[attribution](https://code.claude.com/docs/en/settings-reference#attribution),
[cloud environment variables](https://code.claude.com/docs/en/cloud-environments#set-environment-variables),
[personal cloud instructions](https://code.claude.com/docs/en/cloud-environments#add-personal-preferences-without-committing-to-the-repo).

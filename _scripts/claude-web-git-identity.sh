#!/bin/bash
# Project SessionStart hook: only this repository's cloud sessions opt into
# its tracked personal identity. Never install a global cloud/VM fallback.

set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = true ] || exit 0
: "${CLAUDE_PROJECT_DIR:?Claude project directory is required}"
: "${CLAUDE_ENV_FILE:?Claude environment file is required}"

root=$(CDPATH= cd -- "$CLAUDE_PROJECT_DIR" && pwd -P)
top=$(git -C "$root" rev-parse --show-toplevel)
[ "$(CDPATH= cd -- "$top" && pwd -P)" = "$root" ] || {
  echo "Claude Git identity: project directory must be the repository root" >&2
  exit 1
}

identity="$root/git/.config/git/config.personal"
name=$(git config --file "$identity" --no-includes --get user.name)
email=$(git config --file "$identity" --no-includes --get user.email)
[ -n "$name" ] && [ -n "$email" ] || {
  echo "Claude Git identity: tracked personal name and email are required" >&2
  exit 1
}

# Cloud VMs don't have the Mac's includeIf directory layout. Select the
# identity for this checkout only; don't deploy the Mac config into the VM.
git -C "$root" config --local user.name "$name"
git -C "$root" config --local user.email "$email"
git -C "$root" config --local user.useConfigOnly true

# Cloud defaults may also export GIT_AUTHOR_* / GIT_COMMITTER_*; these win over
# user.* config. Persist both identities for subsequent Claude Bash commands.
# %q safely quotes values as Bash source. Append to preserve other hooks.
{
  printf 'export GIT_AUTHOR_NAME=%q\n' "$name"
  printf 'export GIT_AUTHOR_EMAIL=%q\n' "$email"
  printf 'export GIT_COMMITTER_NAME=%q\n' "$name"
  printf 'export GIT_COMMITTER_EMAIL=%q\n' "$email"
} >> "$CLAUDE_ENV_FILE"

printf 'Claude web Git identity: author and committer use %s <%s>.\n' "$name" "$email"

#!/bin/sh
# Disposable regressions for shell discovery and Claude's Git identity probe.
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
created=$(mktemp -d "${TMPDIR:-/tmp}/doctor-repository-test.XXXXXX")
trap 'rm -rf "$created"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
tmp=$(CDPATH= cd -- "$created" && pwd -P)
awk '
  /^check_shell_syntax\(\) \{$/ || /^check_claude_git_identity\(\) \{$/ { copying = 1; found++ }
  copying { print }
  copying && /^}$/ { copying = 0 }
  END { if (found != 2) exit 1 }
' "$repo/_scripts/doctor.sh" > "$tmp/check.sh"
. "$tmp/check.sh"
pass() { printf 'PASSED: %s\n' "$1"; }
fail() { printf 'FAILED: %s\n' "$1"; }
warn() { printf 'WARNING: %s\n' "$1"; }
debug() { :; }
debug_output() { :; }
command_exists() { command -v "$1" >/dev/null 2>&1; }
assert_result() {
  if ! printf '%s\n' "$output" | grep -F "$1" >/dev/null; then
    printf 'FAILED: %s\n%s\n' "$label" "$output" >&2
    exit 1
  fi
  printf 'PASSED: %s\n' "$label"
}

ROOT="$tmp/checkout with spaces"
TEMP_ROOT="$tmp"
mkdir -p "$ROOT/zsh" "$ROOT/scripts" "$ROOT/claude/.claude"
# Keep init independent of the caller's Git configuration and index.
(
  unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_CONFIG_COUNT GIT_CONFIG_PARAMETERS
  GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 git -C "$ROOT" init -q --template=
)
for name in .zprofile .zshenv .zshrc; do printf '# fixture\n' > "$ROOT/zsh/$name"; done
printf 'node_modules/\n' > "$ROOT/.gitignore"
mkdir -p "$ROOT/node_modules"
printf '#!/bin/sh\nif\n' > "$ROOT/node_modules/ignored"
printf '#!/usr/bin/env ruby\nputs(1 + 2)\n' > "$ROOT/scripts/ruby"
printf '#!/usr/bin/env -S bash -eu\nprintf "ok\\n"\n' > "$ROOT/scripts/shell with spaces"
printf '\377\376binary\000bytes\n' > "$ROOT/binary.png"
ln -s "$ROOT/node_modules/ignored" "$ROOT/scripts/ignored-link"
label='untracked shell, spaced path, env -S, ignored dependency, non-shell and binary headers'
output=$(check_shell_syntax 2>&1)
assert_result 'PASSED: Shell script syntax'
label='broken extensionless shell is rejected'
printf '#!/bin/sh\nif\n' > "$ROOT/scripts/broken"
output=$(check_shell_syntax 2>&1)
assert_result 'FAILED: Shell script syntax'
rm "$ROOT/scripts/broken"
label='broken .sh without shebang is rejected'
printf 'if\n' > "$ROOT/scripts/broken.sh"
output=$(check_shell_syntax 2>&1)
assert_result 'FAILED: Shell script syntax'
rm "$ROOT/scripts/broken.sh"

command_exists jq || { printf 'jq required for these regression fixtures\n' >&2; exit 1; }
for kind in valid false missing invalid-count missing-slot duplicate-override unrelated-error inherited-env; do
  case "$kind" in
    valid|inherited-env) json='{"env":{"GIT_CONFIG_COUNT":"1","GIT_CONFIG_KEY_0":"user.useConfigOnly","GIT_CONFIG_VALUE_0":"true"}}' ;;
    false) json='{"env":{"GIT_CONFIG_COUNT":"1","GIT_CONFIG_KEY_0":"user.useConfigOnly","GIT_CONFIG_VALUE_0":"false"}}' ;;
    missing) json='{}' ;;
    invalid-count) json='{"env":{"GIT_CONFIG_COUNT":"invalid","GIT_CONFIG_KEY_0":"user.useConfigOnly","GIT_CONFIG_VALUE_0":"true"}}' ;;
    missing-slot) json='{"env":{"GIT_CONFIG_COUNT":"2","GIT_CONFIG_KEY_0":"user.useConfigOnly","GIT_CONFIG_VALUE_0":"true"}}' ;;
    duplicate-override) json='{"env":{"GIT_CONFIG_COUNT":"2","GIT_CONFIG_KEY_0":"user.useConfigOnly","GIT_CONFIG_VALUE_0":"true","GIT_CONFIG_KEY_1":"user.useConfigOnly","GIT_CONFIG_VALUE_1":"false"}}' ;;
    unrelated-error) json='{"env":{"GIT_CONFIG_COUNT":"4","GIT_CONFIG_KEY_0":"user.useConfigOnly","GIT_CONFIG_VALUE_0":"true","GIT_CONFIG_KEY_1":"user.name","GIT_CONFIG_VALUE_1":"Fixture","GIT_CONFIG_KEY_2":"user.email","GIT_CONFIG_VALUE_2":"fixture@doctor.invalid","GIT_CONFIG_KEY_3":"commit.cleanup","GIT_CONFIG_VALUE_3":"invalid"}}' ;;
  esac
  printf '%s\n' "$json" > "$ROOT/claude/.claude/settings.json"
  label="Claude Git identity: $kind"
  if [ "$kind" = inherited-env ]; then
    printf '[user]\n name = Leaked fixture\n email = leak@fixture.invalid\n' > "$tmp/leaked-config"
    output=$(
      export GIT_CONFIG_GLOBAL="$tmp/leaked-config" GIT_AUTHOR_NAME=Leaked GIT_AUTHOR_EMAIL=leak@fixture.invalid \
        GIT_COMMITTER_NAME=Leaked GIT_COMMITTER_EMAIL=leak@fixture.invalid \
        GIT_DIR="$tmp/not-a-repo" GIT_WORK_TREE="$tmp" GIT_INDEX_FILE="$tmp/not-an-index" \
        GIT_CONFIG_PARAMETERS="'user.useConfigOnly=false'"
      check_claude_git_identity 2>&1
    )
  else
    output=$(check_claude_git_identity 2>&1)
  fi
  case "$kind" in
    valid|inherited-env) assert_result 'PASSED: Claude Git identity fails closed in unknown paths' ;;
    unrelated-error) assert_result 'FAILED: Claude Git identity (commit failed for an unrelated reason)' ;;
    *) assert_result 'FAILED: Claude Git identity' ;;
  esac
done
# All function-owned temporary files/directories should have been removed.
if find "$tmp" -name 'dev-doctor-shell.*' -o -name 'dev-doctor-claude.*' | grep . >/dev/null; then
  printf 'FAILED: fixture cleanup\n' >&2; exit 1
fi
printf '11 repository doctor regression checks passed\n'

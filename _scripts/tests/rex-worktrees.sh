#!/bin/bash
# Run Lua lifecycle fixtures through Rex itself; no Python or standalone Lua.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
if [[ -n ${REX_BIN_DIR:-} ]]; then
  rex="$REX_BIN_DIR/rex"
else
  rex=$(command -v rex || true)
fi
if [[ -z $rex || ! -x $rex ]]; then
  printf 'Rex CLI missing; run from a Rex terminal or set REX_BIN_DIR.\n' >&2
  exit 1
fi
scratch=$(mktemp -d "${TMPDIR:-/tmp}/rex-worktrees.XXXXXX")
trap 'rm -rf -- "$scratch"' EXIT

# All session/client calls are mocked; only Git fixtures under scratch mutate.
"$rex" --autostart=false do "$root/_scripts/tests/rex-worktrees.lua" \
  "root=$root" "fixture=$scratch" --json

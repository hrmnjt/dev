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
probe_pid=
cleanup() {
  if [[ -n $probe_pid ]]; then
    kill "$probe_pid" 2>/dev/null || true
    wait "$probe_pid" 2>/dev/null || true
  fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT

# All session/client calls are mocked; only Git fixtures under scratch mutate.
"$rex" --autostart=false do "$root/_scripts/tests/rex-worktrees.lua" \
  "root=$root" "fixture=$scratch" --json

# A killed Lua CLI must not leave a lock owner alive or need stale-PID recovery.
lock="$scratch/abandoned.lock"
"$rex" --autostart=false do "$root/_scripts/tests/rex-worktrees.lua" \
  "root=$root" "lock_probe=$lock" >"$scratch/lock-probe.log" 2>&1 &
probe_pid=$!
ready=false
for ((i = 0; i < 50; i++)); do
  if grep -q '^LOCK_READY' "$scratch/lock-probe.log"; then ready=true; break; fi
  sleep 0.1
done
if [[ $ready != true ]]; then printf 'Lock probe failed to become ready.\n' >&2; exit 1; fi
if /usr/bin/lockf -k -t 0 "$lock" /usr/bin/true 2>/dev/null; then
  printf 'Concurrent process incorrectly acquired the project lock.\n' >&2
  exit 1
else
  [[ $? == 75 ]] || exit 1
fi
kill -KILL "$probe_pid"
wait "$probe_pid" 2>/dev/null || true
probe_pid=
for ((i = 0; i < 50; i++)); do
  if /usr/bin/lockf -k -t 0 "$lock" /usr/bin/true 2>/dev/null; then
    printf 'PASS kernel lock releases after abrupt Lua process death\n'
    exit 0
  fi
  sleep 0.1
done
printf 'Project lock remained held after its Lua owner died.\n' >&2
exit 1

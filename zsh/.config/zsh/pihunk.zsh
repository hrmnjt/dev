# Hunk review helpers for pi
#
# Simple workflow:
#   1. Let pi make edits.
#   2. Open a host terminal and run: pihunk
#   3. Leave Hunk open, add comments in the Hunk UI.
#   4. In another host terminal for the same repo, run: hunkfb
#   5. Back in pi, run: /hunk
#
# Why two host terminals? Hunk keeps human UI comments in its live session state.
# `hunkfb` queries that live session via `hunk session comment list` and writes
# the durable repo-local handoff file `.hunk-feedback.md`.

__pihunk_err() {
  print -u2 -- "pihunk: $*"
}

__pihunk_require_git_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
    __pihunk_err "not inside a git worktree"
    return 1
  }
}

__pihunk_root() {
  git rev-parse --show-toplevel 2>/dev/null
}

__pihunk_git_dir() {
  git rev-parse --path-format=absolute --git-dir 2>/dev/null
}

__pihunk_exclude_feedback_file() {
  local git_dir exclude entry
  git_dir=$(__pihunk_git_dir) || return 0
  exclude="$git_dir/info/exclude"
  entry=".hunk-feedback.md"

  mkdir -p "${exclude:h}" || return 1
  touch "$exclude" || return 1

  if ! grep -Fxq "$entry" "$exclude" 2>/dev/null; then
    print -r -- "$entry" >> "$exclude"
  fi
}

__pihunk_run_hunk() {
  case "$1" in
    diff|show|stash|patch|pager|difftool|session|skill|daemon|-h|--help|-v|--version )
      hunk "$@"
      ;;
    * )
      hunk diff "$@"
      ;;
  esac
}

# Open Hunk. Defaults to `hunk diff`.
pihunk() {
  __pihunk_require_git_repo || return 1

  if ! command -v hunk >/dev/null 2>&1; then
    __pihunk_err "hunk not found on PATH"
    return 1
  fi

  local root
  root=$(__pihunk_root) || return 1
  __pihunk_exclude_feedback_file || return 1

  # Make untracked pi-created files visible in the Hunk/git diff without
  # staging their contents.
  git -C "$root" add -N . >/dev/null 2>&1 || true

  cat <<EOF

pihunk
──────
Opening Hunk for: $root

Add comments in Hunk, keep Hunk open, then in another terminal run:
  cd "$root" && hunkfb

Then switch back to pi and run:
  /hunk

EOF

  (cd "$root" && __pihunk_run_hunk "$@")
}

# Export user comments from the currently running Hunk session into the durable
# repo-local handoff file read by pi's `/hunk` command.
hunkfb() {
  __pihunk_require_git_repo || return 1

  if ! command -v hunk >/dev/null 2>&1; then
    __pihunk_err "hunk not found on PATH"
    return 1
  fi

  local root out tmp
  root=$(__pihunk_root) || return 1
  out="$root/.hunk-feedback.md"
  tmp=$(mktemp) || return 1

  __pihunk_exclude_feedback_file || return 1

  if ! hunk session comment list --repo "$root" --type user --json > "$tmp"; then
    rm -f "$tmp"
    __pihunk_err "failed to query Hunk comments; make sure a Hunk window is still open for this repo"
    return 1
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$tmp" "$out" "$root" <<'PY'
import json
import sys
from datetime import datetime, timezone

src, out, root = sys.argv[1:4]
with open(src, "r", encoding="utf-8") as f:
    payload = json.load(f)
comments = payload.get("comments", [])

with open(out, "w", encoding="utf-8") as f:
    f.write("# Hunk feedback for pi\n\n")
    f.write(f"Generated: {datetime.now(timezone.utc).isoformat()}\n\n")
    f.write(f"Repo: {root}\n\n")
    f.write("Run `/hunk` in pi to send this feedback to the model.\n\n")
    f.write(f"## User comments ({len(comments)})\n\n")
    if comments:
        for i, c in enumerate(comments, 1):
            file_path = c.get("filePath", "(unknown file)")
            hunk = c.get("hunkIndex")
            old_range = c.get("oldRange")
            new_range = c.get("newRange")
            body = (c.get("body") or c.get("summary") or "").strip()
            f.write(f"### {i}. {file_path}\n\n")
            if hunk is not None:
                f.write(f"- Hunk: {hunk + 1}\n")
            if old_range is not None:
                f.write(f"- Old range: {old_range}\n")
            if new_range is not None:
                f.write(f"- New range: {new_range}\n")
            f.write("\n")
            f.write(body or "(empty comment)")
            f.write("\n\n")
    else:
        f.write("(none)\n\n")

    f.write("## Raw Hunk comment JSON\n\n")
    f.write("~~~json\n")
    json.dump(payload, f, indent=2)
    f.write("\n~~~\n")
PY
  else
    {
      print -r -- "# Hunk feedback for pi"
      print -r -- ""
      print -r -- "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      print -r -- ""
      print -r -- "Repo: $root"
      print -r -- ""
      print -r -- "Run \`/hunk\` in pi to send this feedback to the model."
      print -r -- ""
      print -r -- "~~~json"
      cat "$tmp"
      print -r -- "~~~"
    } > "$out"
  fi

  rm -f "$tmp"

  print -r -- "hunkfb: wrote $out"
  print -r -- "hunkfb: now run /hunk in pi"
}

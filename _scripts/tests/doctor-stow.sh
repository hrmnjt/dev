#!/bin/sh
# Regression checks for doctor's Stow diagnostic, using disposable fixtures only.
set -eu

repo=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
created_tmp=$(mktemp -d "${TMPDIR:-/tmp}/doctor-stow-test.XXXXXX")
trap 'rm -rf "$created_tmp"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# /var and custom TMPDIR paths can be symlinks. Keep those ancestors out of
# fixture HOME paths, so they cannot be mistaken for Stow deployment links.
tmp=$(CDPATH= cd -- "$created_tmp" && pwd -P)

# Load only the real function, not the rest of the host diagnostics.
awk '
  /^check_stow_links\(\) \{$/ { copying = 1 }
  copying { print }
  copying && /^}$/ { found = 1; exit }
  END { if (!found) exit 1 }
' "$repo/_scripts/doctor.sh" > "$tmp/check.sh"
pass() { printf 'PASSED: %s\n' "$1"; }
fail() { printf 'FAILED: %s\n' "$1"; }
. "$tmp/check.sh"

for kind in file-link folded-directory unmanaged-file missing-file dangling-link wrong-target; do
  ROOT="$tmp/$kind/checkout"
  HOME="$tmp/$kind/home"
  TEMP_ROOT="$tmp/$kind"
  source_dir="$ROOT/glow/.config/glow/themes"
  target_dir="$HOME/.config/glow/themes"
  source="$source_dir/style.json"
  target="$target_dir/style.json"
  mkdir -p "$source_dir" "$(dirname -- "$target_dir")" "$ROOT/_tests"
  printf '{}\n' > "$source"
  # Repository-only helpers and package guides must not require deployment.
  printf 'local\n' > "$ROOT/_tests/local.txt"
  printf 'guide\n' > "$ROOT/glow/README.md"

  if [ "$kind" = folded-directory ]; then
    ln -s "$source_dir" "$target_dir"
  else
    mkdir -p "$target_dir"
    case "$kind" in
      file-link) ln -s "$source" "$target" ;;
      unmanaged-file) printf '{}\n' > "$target" ;;
      dangling-link) ln -s "$tmp/absent" "$target" ;;
      wrong-target)
        printf '{}\n' > "$TEMP_ROOT/other.json"
        ln -s "$TEMP_ROOT/other.json" "$target"
        ;;
    esac
  fi

  output=$(check_stow_links)
  case "$kind" in
    file-link|folded-directory)
      expected='PASSED: Stow deployment links'
      [ "$output" = "$expected" ] || {
        printf 'FAILED: %s\n%s\n' "$kind" "$output" >&2
        exit 1
      }
      ;;
    *)
      reason='missing link'
      case "$kind" in
        dangling-link) reason='dangling link' ;;
        wrong-target) reason='wrong link target' ;;
      esac
      if ! printf '%s\n' "$output" | grep -F "FAILED: Stow deployment links (1 problem(s);" >/dev/null ||
         ! printf '%s\n' "$output" | grep -F "$reason: $target" >/dev/null; then
        printf 'FAILED: %s\n%s\n' "$kind" "$output" >&2
        exit 1
      fi
      ;;
  esac
  printf 'PASSED: %s\n' "$kind"
done
printf '6 Stow regression checks passed\n'

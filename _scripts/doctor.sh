#!/bin/sh

# Non-mutating repository and host diagnostics for this dotfiles checkout.
# Keep this script compatible with macOS /bin/sh.

set -u

ONLY_CHECK=${DOCTOR_ONLY_CHECK:-false}
VERBOSE=${DOCTOR_VERBOSE:-false}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --only-check) ONLY_CHECK=true ;;
    --verbose|-v) VERBOSE=true ;;
    *)
      echo "usage: $0 [--only-check] [--verbose|-v]" >&2
      exit 2
      ;;
  esac
  shift
done

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TEMP_ROOT=${TMPDIR:-/tmp}
[ -d "$TEMP_ROOT" ] || TEMP_ROOT=/tmp
started_at=$(date +%s)
passed=0
failures=0
warnings=0

result() {
  printf '  %-54s %s\n' "$2" "$1"
}

pass() {
  passed=$((passed + 1))
  result PASSED "$1"
}

warn() {
  warnings=$((warnings + 1))
  result WARNING "$1"
}

fail() {
  failures=$((failures + 1))
  result FAILED "$1"
}

debug() {
  if [ "$VERBOSE" = true ]; then
    printf '      %s\n' "$1"
  fi
}

debug_output() {
  if [ "$VERBOSE" = true ] && [ -n "$1" ]; then
    printf '%s\n' "$1" | sed 's/^/      /'
  fi
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

check_repository_whitespace() {
  if git -C "$ROOT" diff --check && git -C "$ROOT" diff --cached --check; then
    pass "Git diff whitespace"
  else
    fail "Git diff whitespace"
  fi
}

check_conflict_markers() {
  marker_output=$(git -C "$ROOT" grep -n -E '^(<<<<<<<|>>>>>>>)' -- . 2>/dev/null || true)
  if [ -n "$marker_output" ]; then
    printf '%s\n' "$marker_output"
    fail "Unresolved conflict markers"
  else
    pass "No unresolved conflict markers"
  fi
}

check_shell_syntax() {
  shell_failed=false

  for script in $(find "$ROOT" -type f -name '*.sh' ! -path '*/.git/*' ! -path '*/node_modules/*' -print); do
    case "$(sed -n '1p' "$script")" in
      *bash*)
        if command_exists bash; then
          bash -n "$script" || shell_failed=true
        else
          shell_failed=true
        fi
        ;;
      *) sh -n "$script" || shell_failed=true ;;
    esac
  done

  if [ "$shell_failed" = true ]; then
    fail "Shell script syntax"
  else
    pass "Shell script syntax"
  fi

  if command_exists zsh; then
    zsh_failed=false
    for config in "$ROOT"/zsh/.zprofile "$ROOT"/zsh/.zshenv "$ROOT"/zsh/.zshrc; do
      zsh -n "$config" || zsh_failed=true
    done
    if [ "$zsh_failed" = true ]; then
      fail "Zsh configuration syntax"
    else
      pass "Zsh configuration syntax"
    fi
  else
    warn "Zsh configuration syntax skipped (zsh unavailable)"
  fi
}

check_json() {
  if ! command_exists jq; then
    fail "JSON validation unavailable (jq missing)"
    return
  fi

  json_failed=false
  for file in $(git -C "$ROOT" ls-files '*.json'); do
    # Zed uses JSON with comments and trailing commas rather than strict JSON.
    case "$file" in zed/*) continue ;; esac
    jq empty "$ROOT/$file" >/dev/null 2>&1 || {
      printf '      invalid: %s\n' "$file"
      json_failed=true
    }
  done

  if [ "$json_failed" = true ]; then
    fail "Tracked strict JSON"
  else
    pass "Tracked strict JSON"
  fi
}

check_toml() {
  if ! command_exists python3 || ! python3 -c 'import tomllib' >/dev/null 2>&1; then
    warn "TOML validation skipped (Python tomllib unavailable)"
    return
  fi

  toml_files=$(git -C "$ROOT" ls-files '*.toml')
  if [ -z "$toml_files" ]; then
    pass "Tracked TOML"
    return
  fi

  # Repository paths intentionally contain no whitespace.
  # shellcheck disable=SC2086
  if python3 - $toml_files <<'PY'
from pathlib import Path
import sys
import tomllib

root = Path.cwd()
failed = False
for name in sys.argv[1:]:
    path = root / name
    try:
        with path.open("rb") as handle:
            tomllib.load(handle)
    except Exception as error:
        failed = True
        print(f"      invalid: {name}: {error}")
raise SystemExit(1 if failed else 0)
PY
  then
    pass "Tracked TOML"
  else
    fail "Tracked TOML"
  fi
}

check_git_configs() {
  config_failed=false
  for file in "$ROOT"/git/.config/git/config "$ROOT"/git/.config/git/config.personal "$ROOT"/git/.config/git/config.work; do
    git config --file "$file" --list >/dev/null 2>&1 || config_failed=true
  done

  if [ "$config_failed" = true ]; then
    fail "Tracked Git configuration syntax"
  else
    pass "Tracked Git configuration syntax"
  fi
}

check_git_identities() {
  identity_tmp=$(mktemp -d "$TEMP_ROOT/dev-doctor.XXXXXX") || {
    fail "Git identity tests (temporary directory unavailable)"
    return
  }
  identity_home="$identity_tmp/home"
  identity_config="$identity_home/.config/git"
  personal_repo="$identity_home/code/github.com/hrmnjt/check"
  work_repo="$identity_home/code/work/doh/check"
  unknown_repo="$identity_home/code/unknown/check"
  linked_repo="$identity_tmp/linked-personal"

  mkdir -p "$identity_config" "$personal_repo" "$work_repo" "$unknown_repo"
  cp "$ROOT"/git/.config/git/config* "$identity_config/"

  for repo in "$personal_repo" "$work_repo" "$unknown_repo"; do
    HOME="$identity_home" XDG_CONFIG_HOME="$identity_home/.config" GIT_CONFIG_NOSYSTEM=1 \
      git -C "$repo" init -q
  done

  expected_personal=$(git config --file "$ROOT/git/.config/git/config.personal" --get user.email)
  expected_work=$(git config --file "$ROOT/git/.config/git/config.work" --get user.email)
  actual_personal=$(HOME="$identity_home" XDG_CONFIG_HOME="$identity_home/.config" GIT_CONFIG_NOSYSTEM=1 \
    git -C "$personal_repo" config --includes --get user.email 2>/dev/null || true)
  actual_work=$(HOME="$identity_home" XDG_CONFIG_HOME="$identity_home/.config" GIT_CONFIG_NOSYSTEM=1 \
    git -C "$work_repo" config --includes --get user.email 2>/dev/null || true)
  actual_unknown=$(HOME="$identity_home" XDG_CONFIG_HOME="$identity_home/.config" GIT_CONFIG_NOSYSTEM=1 \
    git -C "$unknown_repo" config --includes --get user.email 2>/dev/null || true)

  if [ "$actual_personal" = "$expected_personal" ]; then
    pass "Personal Git identity selection"
  else
    fail "Personal Git identity selection"
  fi

  if [ "$actual_work" = "$expected_work" ]; then
    pass "Work Git identity selection"
  else
    fail "Work Git identity selection"
  fi

  if [ -z "$actual_unknown" ]; then
    pass "Unknown Git paths remain fail-closed"
  else
    fail "Unknown Git paths remain fail-closed"
  fi

  linked_ok=false
  if HOME="$identity_home" XDG_CONFIG_HOME="$identity_home/.config" GIT_CONFIG_NOSYSTEM=1 \
      git -C "$personal_repo" commit -q --allow-empty -m doctor-test &&
    HOME="$identity_home" XDG_CONFIG_HOME="$identity_home/.config" GIT_CONFIG_NOSYSTEM=1 \
      git -C "$personal_repo" worktree add -q --detach "$linked_repo" HEAD; then
    linked_email=$(HOME="$identity_home" XDG_CONFIG_HOME="$identity_home/.config" GIT_CONFIG_NOSYSTEM=1 \
      git -C "$linked_repo" config --includes --get user.email 2>/dev/null || true)
    [ "$linked_email" = "$expected_personal" ] && linked_ok=true
  fi

  if [ "$linked_ok" = true ]; then
    pass "Linked worktrees inherit primary Git identity"
  else
    fail "Linked worktrees inherit primary Git identity"
  fi

  rm -rf "$identity_tmp"
}

check_justfile() {
  if command_exists just; then
    just_output=$(just --justfile "$ROOT/Justfile" --list 2>&1)
    just_status=$?
    debug "command: just --justfile $ROOT/Justfile --list"
    debug_output "$just_output"
    if [ "$just_status" -eq 0 ]; then
      pass "Justfile syntax"
    else
      fail "Justfile syntax"
    fi
  else
    warn "Justfile syntax skipped (just unavailable)"
  fi
}

run_repository_checks() {
  printf '\n============================ repository checks ============================\n'
  debug "root: $ROOT"
  check_repository_whitespace
  check_conflict_markers
  check_shell_syntax
  check_json
  check_toml
  check_git_configs
  check_git_identities
  check_justfile
}

check_expected_commands() {
  missing_commands=""
  for name in aerospace borders brew fzf gh git herdr jq just lazygit nvim node npm pi rg starship stow uv zsh; do
    if ! command_exists "$name"; then
      missing_commands="$missing_commands $name"
    fi
  done

  if [ -z "$missing_commands" ]; then
    pass "Expected host commands"
  else
    fail "Expected host commands (missing:$missing_commands)"
  fi
}

check_brew_bundle() {
  if ! command_exists brew; then
    fail "Brew bundle (brew unavailable)"
    return
  fi

  brew_output=$(brew bundle check --file="$ROOT/Brewfile" 2>&1)
  brew_status=$?
  debug "command: brew bundle check --file=$ROOT/Brewfile"
  debug_output "$brew_output"
  if [ "$brew_status" -eq 0 ]; then
    pass "Brewfile packages"
  else
    fail "Brewfile packages (run: brew bundle install)"
  fi
}

check_stow_links() {
  stow_tmp=$(mktemp "$TEMP_ROOT/dev-doctor-stow.XXXXXX") || {
    fail "Stow deployment (temporary file unavailable)"
    return
  }
  : > "$stow_tmp"

  for package in "$ROOT"/*/; do
    package_name=$(basename "$package")
    case "$package_name" in
      _*|.*) continue ;;
    esac
    find "$package" \( -type f -o -type l \) \
      ! -name 'README.md' ! -name '.gitignore' ! -name '.stow-local-ignore' \
      -print >> "$stow_tmp"
  done

  stow_missing=0
  while IFS= read -r source; do
    package=${source#"$ROOT/"}
    package=${package%%/*}
    relative=${source#"$ROOT/$package/"}
    target="$HOME/$relative"

    if [ ! -L "$target" ]; then
      printf '      missing link: %s\n' "$target"
      stow_missing=$((stow_missing + 1))
    elif [ ! -e "$target" ]; then
      printf '      dangling link: %s\n' "$target"
      stow_missing=$((stow_missing + 1))
    fi
  done < "$stow_tmp"
  rm -f "$stow_tmp"

  if [ "$stow_missing" -eq 0 ]; then
    pass "Stow deployment links"
  else
    fail "Stow deployment links ($stow_missing problem(s); run: just stowall)"
  fi
}

check_host_git_identity() {
  expected=$(git config --file "$ROOT/git/.config/git/config.personal" --get user.email)
  actual=$(git -C "$ROOT" config --includes --get user.email 2>/dev/null || true)
  debug "expected email: $expected"
  debug "actual email: ${actual:-<unset>}"
  if [ "$actual" = "$expected" ]; then
    pass "Deployed Git identity for this checkout"
  else
    fail "Deployed Git identity for this checkout"
  fi
}

check_pi() {
  if [ -f "$HOME/.pi/agent/settings.json" ] && jq empty "$HOME/.pi/agent/settings.json" >/dev/null 2>&1; then
    pass "Pi runtime settings"
  else
    fail "Pi runtime settings"
  fi

  if command_exists npm; then
    npm_output=$(npm ls --prefix "$HOME/.pi/agent" --depth=0 2>&1)
    npm_status=$?
    debug "command: npm ls --prefix $HOME/.pi/agent --depth=0"
    debug_output "$npm_output"
    if [ "$npm_status" -eq 0 ]; then
      pass "Pi extension dependencies"
    else
      fail "Pi extension dependencies (run: npm install --prefix ~/.pi/agent)"
    fi
  else
    fail "Pi extension dependencies (npm unavailable)"
  fi

  image_dir=${GONDOLIN_GUEST_DIR:-"$HOME/.gondolin/custom-image"}
  if [ -d "$image_dir" ]; then
    pass "Gondolin custom image"
  else
    fail "Gondolin custom image (run: just gondolin-image)"
  fi
}

check_aerospace() {
  if ! command_exists aerospace; then
    fail "AeroSpace configuration (aerospace unavailable)"
    return
  fi

  aerospace_output=$(aerospace config --get mode.main.binding --json 2>&1)
  aerospace_status=$?
  debug "command: aerospace config --get mode.main.binding --json"
  debug_output "$aerospace_output"
  if [ "$aerospace_status" -eq 0 ] && printf '%s' "$aerospace_output" | jq empty >/dev/null 2>&1; then
    pass "AeroSpace configuration"
  else
    fail "AeroSpace configuration"
  fi
}

check_herdr() {
  if ! command_exists herdr; then
    fail "Herdr Pi integration (herdr unavailable)"
    fail "Herdr default-tabs plugin (herdr unavailable)"
    return
  fi

  herdr_integration_output=$(herdr integration status 2>&1)
  herdr_integration_status=$?
  debug "command: herdr integration status"
  debug_output "$herdr_integration_output"
  if [ "$herdr_integration_status" -eq 0 ]; then
    pass "Herdr Pi integration"
  else
    fail "Herdr Pi integration"
  fi

  herdr_plugin_output=$(herdr plugin list --plugin hrmnjt.default-tabs 2>&1)
  herdr_plugin_status=$?
  debug "command: herdr plugin list --plugin hrmnjt.default-tabs"
  debug_output "$herdr_plugin_output"
  if [ "$herdr_plugin_status" -eq 0 ]; then
    pass "Herdr default-tabs plugin"
  else
    fail "Herdr default-tabs plugin"
  fi
}

check_github_auth() {
  if ! command_exists gh; then
    warn "GitHub CLI authentication unavailable (gh missing)"
    return
  fi

  gh_output=$(gh auth status 2>&1)
  gh_status=$?
  debug "command: gh auth status"
  debug_output "$gh_output"
  if [ "$gh_status" -eq 0 ]; then
    pass "GitHub CLI authentication"
  else
    warn "GitHub CLI authentication unavailable"
  fi
}

run_host_checks() {
  printf '\n=============================== host checks ===============================\n'
  if [ "$(uname -s)" != Darwin ]; then
    warn "Host checks skipped (not running on macOS)"
    return
  fi

  check_expected_commands
  check_brew_bundle
  check_stow_links
  check_host_git_identity
  check_pi
  check_aerospace
  check_herdr
  check_github_auth
}

finish() {
  finished_at=$(date +%s)
  elapsed=$((finished_at - started_at))
  printf '\n================ %s passed, %s failed, %s warnings in %ss ================\n' \
    "$passed" "$failures" "$warnings" "$elapsed"
  if [ "$failures" -ne 0 ]; then
    if [ "$VERBOSE" != true ]; then
      if [ "$ONLY_CHECK" = true ]; then
        printf 'Re-run with: just doctor --only-check --verbose\n'
      else
        printf 'Re-run with: just doctor --verbose\n'
      fi
    fi
    exit 1
  fi
}

cd "$ROOT" || exit 1
run_repository_checks
if [ "$ONLY_CHECK" = false ]; then
  run_host_checks
fi
finish

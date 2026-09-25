#!/bin/sh

# Preview, back up, apply, and restore intentional macOS behavioral defaults.
# Backups contain only the keys managed here and preserve whether each key was
# originally absent. This script never restarts applications automatically.

set -eu
umask 077

STATE_HOME=${XDG_STATE_HOME:-"$HOME/.local/state"}
BACKUP_ROOT="$STATE_HOME/hrmnjt-dev/macos-defaults"
CREATED_BACKUP=""

SETTINGS=$(cat <<EOF
001|NSGlobalDomain|AppleShowAllExtensions|bool|true|Show all filename extensions
002|NSGlobalDomain|KeyRepeat|int|2|Use a fast key-repeat rate
003|NSGlobalDomain|InitialKeyRepeat|int|15|Reduce the key-repeat delay
004|NSGlobalDomain|NSAutomaticQuoteSubstitutionEnabled|bool|false|Disable smart quotes
005|NSGlobalDomain|NSAutomaticDashSubstitutionEnabled|bool|false|Disable smart dashes
006|NSGlobalDomain|NSNavPanelExpandedStateForSaveMode|bool|true|Expand save dialogs
007|NSGlobalDomain|NSNavPanelExpandedStateForSaveMode2|bool|true|Expand modern save dialogs
008|NSGlobalDomain|PMPrintingExpandedStateForPrint|bool|true|Expand print dialogs
009|NSGlobalDomain|PMPrintingExpandedStateForPrint2|bool|true|Expand modern print dialogs
010|com.apple.dock|autohide|bool|true|Auto-hide the Dock
011|com.apple.dock|show-recents|bool|false|Hide recent applications from the Dock
012|com.apple.dock|mru-spaces|bool|false|Keep Mission Control Spaces in a stable order
013|com.apple.finder|ShowPathbar|bool|true|Show Finder's path bar
014|com.apple.finder|ShowStatusBar|bool|true|Show Finder's status bar
015|com.apple.screencapture|location|string|~/Downloads|Keep screenshots in the Downloads dump folder
016|com.apple.WindowManager|EnableStandardClickToShowDesktop|bool|false|Do not reveal the desktop when clicking wallpaper
EOF
)

usage() {
  cat <<EOF
usage: $0 [preview|backup|apply|backups|restore <backup|latest>]

  preview                 show current and desired values without changing them
  backup                  capture the managed keys without applying changes
  apply                   back up changed keys, then apply desired values
  backups                 list available backup directories
  restore <path|latest>   back up current values, then restore a prior snapshot
EOF
}

require_macos() {
  if [ "$(uname -s)" != Darwin ]; then
    echo "macos-defaults: this command must run on macOS" >&2
    exit 1
  fi
  for required_command in defaults plutil; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
      echo "macos-defaults: missing required command: $required_command" >&2
      exit 1
    fi
  done
}

read_current() {
  current_domain=$1
  current_key=$2
  if CURRENT_VALUE=$(defaults read "$current_domain" "$current_key" 2>/dev/null); then
    CURRENT_PRESENT=true
  else
    CURRENT_PRESENT=false
    CURRENT_VALUE=""
  fi
}

setting_matches() {
  match_type=$1
  match_desired=$2

  [ "$CURRENT_PRESENT" = true ] || return 1
  case "$match_type:$match_desired:$CURRENT_VALUE" in
    bool:true:1|bool:true:true|bool:false:0|bool:false:false) return 0 ;;
    *) [ "$CURRENT_VALUE" = "$match_desired" ] ;;
  esac
}

print_preview() {
  preview_changes=0
  printf '%-8s %-68s %s\n' STATUS SETTING VALUE
  printf '%-8s %-68s %s\n' '--------' '--------------------------------------------------------------------' '-----'

  while IFS='|' read -r id domain key type desired description; do
    read_current "$domain" "$key"
    if setting_matches "$type" "$desired"; then
      status='current'
    else
      status='change'
      preview_changes=$((preview_changes + 1))
    fi
    if [ "$CURRENT_PRESENT" = true ]; then
      current_display=$CURRENT_VALUE
    else
      current_display='<unset>'
    fi
    printf '%-8s %-68s %s -> %s\n' "$status" "$description" "$current_display" "$desired"
  done <<EOF
$SETTINGS
EOF

  printf '\n%s setting(s) would change.\n' "$preview_changes"
}

create_backup() {
  backup_reason=$1
  mkdir -p "$BACKUP_ROOT"
  backup_stamp=$(date '+%Y%m%d-%H%M%S')
  CREATED_BACKUP="$BACKUP_ROOT/$backup_stamp-$backup_reason"
  if [ -e "$CREATED_BACKUP" ]; then
    CREATED_BACKUP="$CREATED_BACKUP-$$"
  fi
  mkdir -p "$CREATED_BACKUP"

  {
    printf 'created_at=%s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
    printf 'reason=%s\n' "$backup_reason"
    printf 'script=%s\n' "$0"
  } > "$CREATED_BACKUP/metadata"

  while IFS='|' read -r id domain key type desired description; do
    read_current "$domain" "$key"
    backup_file="$CREATED_BACKUP/$id.plist"
    plutil -create xml1 "$backup_file"
    plutil -insert id -string "$id" "$backup_file"
    plutil -insert domain -string "$domain" "$backup_file"
    plutil -insert key -string "$key" "$backup_file"
    plutil -insert type -string "$type" "$backup_file"
    plutil -insert description -string "$description" "$backup_file"
    plutil -insert present -bool "$CURRENT_PRESENT" "$backup_file"
    if [ "$CURRENT_PRESENT" = true ]; then
      plutil -insert value -string "$CURRENT_VALUE" "$backup_file"
    fi
  done <<EOF
$SETTINGS
EOF

  ln -sfn "$CREATED_BACKUP" "$BACKUP_ROOT/latest"
  printf 'Backup: %s\n' "$CREATED_BACKUP"
}

write_setting() {
  write_domain=$1
  write_key=$2
  write_type=$3
  write_value=$4

  if [ "$write_type" = bool ]; then
    case "$write_value" in
      1|true|TRUE|yes|YES) write_value=true ;;
      0|false|FALSE|no|NO) write_value=false ;;
      *)
        echo "macos-defaults: invalid backed-up boolean for $write_domain.$write_key: $write_value" >&2
        return 1
        ;;
    esac
  fi

  defaults write "$write_domain" "$write_key" "-$write_type" "$write_value"
}

apply_defaults() {
  apply_changes=0
  while IFS='|' read -r id domain key type desired description; do
    read_current "$domain" "$key"
    if ! setting_matches "$type" "$desired"; then
      apply_changes=$((apply_changes + 1))
    fi
  done <<EOF
$SETTINGS
EOF

  if [ "$apply_changes" -eq 0 ]; then
    echo "All managed defaults already have their desired values."
    return
  fi

  create_backup apply

  while IFS='|' read -r id domain key type desired description; do
    read_current "$domain" "$key"
    if ! setting_matches "$type" "$desired"; then
      write_setting "$domain" "$key" "$type" "$desired"
      printf 'Applied: %s\n' "$description"
    fi
  done <<EOF
$SETTINGS
EOF

  printf '\nApplied %s setting(s). Log out and back in for every change to settle.\n' "$apply_changes"
  echo "To refresh common surfaces sooner, run: killall Dock Finder"
}

list_backups() {
  if [ ! -d "$BACKUP_ROOT" ]; then
    echo "No backups found under $BACKUP_ROOT"
    return
  fi
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -print | sort
}

resolve_backup() {
  backup_argument=$1
  if [ "$backup_argument" = latest ]; then
    if [ ! -L "$BACKUP_ROOT/latest" ]; then
      echo "macos-defaults: no latest backup exists" >&2
      exit 1
    fi
    RESTORE_BACKUP=$(readlink "$BACKUP_ROOT/latest")
  elif [ -d "$backup_argument" ]; then
    RESTORE_BACKUP=$backup_argument
  elif [ -d "$BACKUP_ROOT/$backup_argument" ]; then
    RESTORE_BACKUP="$BACKUP_ROOT/$backup_argument"
  else
    echo "macos-defaults: backup not found: $backup_argument" >&2
    exit 1
  fi
}

validate_backup() {
  validate_dir=$1
  [ -f "$validate_dir/metadata" ] || {
    echo "macos-defaults: invalid backup (metadata missing): $validate_dir" >&2
    exit 1
  }

  while IFS='|' read -r id domain key type desired description; do
    validate_file="$validate_dir/$id.plist"
    [ -f "$validate_file" ] || {
      echo "macos-defaults: invalid backup (missing $id.plist): $validate_dir" >&2
      exit 1
    }
    stored_domain=$(plutil -extract domain raw -o - "$validate_file")
    stored_key=$(plutil -extract key raw -o - "$validate_file")
    stored_type=$(plutil -extract type raw -o - "$validate_file")
    if [ "$stored_domain" != "$domain" ] || [ "$stored_key" != "$key" ] || [ "$stored_type" != "$type" ]; then
      echo "macos-defaults: backup entry $id does not match the current manifest" >&2
      exit 1
    fi
  done <<EOF
$SETTINGS
EOF
}

restore_backup() {
  resolve_backup "$1"
  validate_backup "$RESTORE_BACKUP"
  restore_source=$RESTORE_BACKUP
  create_backup pre-restore

  while IFS='|' read -r id domain key type desired description; do
    restore_file="$restore_source/$id.plist"
    was_present=$(plutil -extract present raw -o - "$restore_file")
    if [ "$was_present" = true ]; then
      previous_value=$(plutil -extract value raw -o - "$restore_file")
      write_setting "$domain" "$key" "$type" "$previous_value"
      printf 'Restored: %s\n' "$description"
    else
      defaults delete "$domain" "$key" >/dev/null 2>&1 || true
      printf 'Removed override: %s\n' "$description"
    fi
  done <<EOF
$SETTINGS
EOF

  printf '\nRestored managed defaults from: %s\n' "$restore_source"
  echo "The pre-restore state was saved to: $CREATED_BACKUP"
  echo "Log out and back in for every change to settle."
}

command_name=${1:-preview}
case "$command_name" in
  help|--help|-h)
    usage
    exit 0
    ;;
esac

require_macos
case "$command_name" in
  preview) print_preview ;;
  backup) create_backup manual ;;
  apply) apply_defaults ;;
  backups) list_backups ;;
  restore)
    [ "$#" -eq 2 ] || {
      usage >&2
      exit 2
    }
    restore_backup "$2"
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

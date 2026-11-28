#!/bin/sh

# Show or switch the setup's theme: gruvbox (the default) or nord.
#
# The choice is one line in $XDG_STATE_HOME/hrmnjt-dev/theme. Zsh rereads it
# at each prompt (fzf, Glow, Lazygit, Starship); Neovim and the Claude VM
# launcher read it at start.
# Switching also links Ghostty's overlay and, on macOS, sets dark mode, the
# accent colour, the wallpaper and live AeroSpace borders. See NORD.md.

set -eu

STATE_HOME=${XDG_STATE_HOME:-"$HOME/.local/state"}
SELECTION="$STATE_HOME/hrmnjt-dev/theme"
GHOSTTY_DIR="$HOME/.config/ghostty"
GHOSTTY_OVERLAY="$GHOSTTY_DIR/theme.local"
WALLPAPER_DIR="$HOME/.local/share/wallpapers"

usage() {
  cat <<EOF
usage: $0 [gruvbox|nord]

  (no argument)   print the selected theme
  gruvbox         switch to Gruvbox Dark Hard, the default
  nord            switch to Nord
EOF
}

die() {
  echo "theme: $*" >&2
  exit 1
}

selected() {
  theme=""
  if [ -r "$SELECTION" ]; then
    # read fails on a final line without a newline but still sets the value.
    IFS= read -r theme < "$SELECTION" || true
  fi
  case $theme in
    gruvbox|nord) ;;
    "") theme=gruvbox ;;
    *)
      echo "theme: ignoring unknown theme '$theme' in $SELECTION" >&2
      theme=gruvbox
      ;;
  esac
  printf '%s\n' "$theme"
}

apply() {
  theme=$1
  case $theme in
    gruvbox)
      accent=1 # orange
      active=0xfffabd2f
      inactive=0x80665c54
      wallpaper="$WALLPAPER_DIR/pink-floyd-gruvbox-dark.jpg"
      ;;
    nord)
      accent=4 # blue
      active=0xff88c0d0
      inactive=0x804c566a
      wallpaper="$WALLPAPER_DIR/dota-2-nord-dark.jpg"
      ;;
  esac

  # Check before changing anything. A folded Stow link would put the overlay
  # inside the repository, and a real file there isn't ours to replace.
  if [ -L "$GHOSTTY_DIR" ]; then
    die "$GHOSTTY_DIR is a folded Stow link; run 'just stowall' to make it a real directory"
  fi
  if [ -e "$GHOSTTY_OVERLAY" ] && [ ! -L "$GHOSTTY_OVERLAY" ]; then
    die "$GHOSTTY_OVERLAY is not a symlink this script made; move it aside first"
  fi

  mkdir -p "$(dirname -- "$SELECTION")"
  printf '%s\n' "$theme" > "$SELECTION.$$"
  mv -f "$SELECTION.$$" "$SELECTION"
  echo "Selected $theme in $SELECTION"

  # Gruvbox lives in Ghostty's tracked config; Nord is an optional overlay.
  if [ ! -d "$GHOSTTY_DIR" ]; then
    echo "Ghostty: skipped ($GHOSTTY_DIR missing; run 'just stowall')"
  elif [ "$theme" = nord ] && [ ! -e "$GHOSTTY_DIR/nord.conf" ]; then
    echo "Ghostty: skipped ($GHOSTTY_DIR/nord.conf missing; run 'just stowall')"
  elif [ "$theme" = nord ]; then
    ln -sfn nord.conf "$GHOSTTY_OVERLAY"
    echo "Ghostty: linked $GHOSTTY_OVERLAY -> nord.conf"
  else
    rm -f "$GHOSTTY_OVERLAY"
    echo "Ghostty: removed the Nord overlay"
  fi

  if [ "$(uname -s)" != Darwin ]; then
    echo "macOS appearance: skipped (not macOS)"
  else
    osascript -e 'tell application "System Events" to tell appearance preferences to set dark mode to true'
    defaults write -g AppleAccentColor -int "$accent"
    echo "macOS: dark mode and accent colour set; some apps update after a restart or logout"
    if [ -f "$wallpaper" ]; then
      osascript -e "tell application \"System Events\" to tell every desktop to set picture to POSIX file \"$wallpaper\""
      echo "Wallpaper: $wallpaper"
    else
      echo "Wallpaper: skipped ($wallpaper missing; run 'just stowall')"
    fi
    # With arguments, borders updates a running instance; without one it would
    # start a new instance in the foreground, so leave that to AeroSpace.
    if pgrep -x borders >/dev/null 2>&1; then
      borders active_color="$active" inactive_color="$inactive"
      echo "Borders: updated"
    else
      echo "Borders: not running; AeroSpace starts them with this theme"
    fi
  fi

  cat <<EOF

Next: reload Ghostty (Cmd+Shift+,) and run Apply Appearance Preferences in
Rex's command palette. Open shells switch at their next prompt, and Neovim
and claude when they next start; pick the theme in Pi's settings.
EOF
}

case ${1-} in
  "") selected ;;
  gruvbox|nord) apply "$1" ;;
  -h|--help) usage ;;
  *)
    usage >&2
    exit 2
    ;;
esac

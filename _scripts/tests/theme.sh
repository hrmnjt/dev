#!/usr/bin/env bash
# Exercise the theme switch with a disposable home and fake macOS commands,
# then check that Zsh's theme block and Neovim's reader follow the selection.
set -euo pipefail
repo=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/theme-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
# Each fake macOS command logs its arguments to a file named after itself.
cat > "$tmp/bin/osascript" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >> "$TEST_LOG/${0##*/}"
SH
cp "$tmp/bin/osascript" "$tmp/bin/defaults"
cp "$tmp/bin/osascript" "$tmp/bin/borders"
cat > "$tmp/bin/uname" <<'SH'
#!/bin/sh
echo "$TEST_UNAME"
SH
cat > "$tmp/bin/pgrep" <<'SH'
#!/bin/sh
exit "$TEST_BORDERS_STATUS"
SH
chmod +x "$tmp/bin/"*
export PATH="$tmp/bin:$PATH"
theme() { /bin/sh "$repo/_scripts/theme.sh" "$@"; }

new_home() {
  export HOME="$tmp/$1/home with spaces" TEST_LOG="$tmp/$1/log"
  export TEST_UNAME=Darwin TEST_BORDERS_STATUS=0
  unset XDG_STATE_HOME
  mkdir -p "$HOME/.config/ghostty" "$HOME/.local/share/wallpapers" "$TEST_LOG"
  ln -s "$repo/ghostty/.config/ghostty/nord.conf" "$HOME/.config/ghostty/nord.conf"
  for image in pink-floyd-gruvbox-dark.jpg dota-2-nord-dark.jpg; do
    ln -s "$repo/wallpapers/.local/share/wallpapers/$image" "$HOME/.local/share/wallpapers/$image"
  done
  selection="$HOME/.local/state/hrmnjt-dev/theme"
  overlay="$HOME/.config/ghostty/theme.local"
}
last() { tail -n 1 "$TEST_LOG/$1"; }
untouched() {
  [[ ! -e "$selection" && ! -e "$TEST_LOG/osascript" && ! -e "$TEST_LOG/defaults" && ! -e "$TEST_LOG/borders" ]]
}

new_home switch
[[ $(theme) == gruvbox ]]
theme nord > "$TEST_LOG/output"
theme nord > "$TEST_LOG/output-again"
[[ $(cat "$selection") == nord && $(theme) == nord ]]
[[ $(readlink "$overlay") == nord.conf && -f "$overlay" ]]
[[ $(last defaults) == "write -g AppleAccentColor -int 4" ]]
[[ $(last borders) == "active_color=0xff88c0d0 inactive_color=0x804c566a" ]]
grep -F "$HOME/.local/share/wallpapers/dota-2-nord-dark.jpg" "$TEST_LOG/osascript" > /dev/null
theme gruvbox > "$TEST_LOG/output-gruvbox"
[[ $(cat "$selection") == gruvbox && ! -e "$overlay" && ! -L "$overlay" ]]
[[ $(last defaults) == "write -g AppleAccentColor -int 1" ]]
[[ $(last borders) == "active_color=0xfffabd2f inactive_color=0x80665c54" ]]
[[ $(last osascript) == *"/pink-floyd-gruvbox-dark.jpg\"" ]]
printf 'PASSED: switch\n'

new_home invalid-name
if theme solarized > "$TEST_LOG/output" 2>&1; then exit 1; fi
untouched
printf 'PASSED: invalid-name\n'

new_home selection-content
mkdir -p "$(dirname "$selection")"
printf 'solarized\n' > "$selection"
[[ $(theme 2> "$TEST_LOG/stderr") == gruvbox ]]
grep -F "unknown theme 'solarized'" "$TEST_LOG/stderr" > /dev/null
printf 'nord' > "$selection"
[[ $(theme) == nord ]]
printf 'PASSED: selection-content\n'

new_home xdg-state
export XDG_STATE_HOME="$tmp/xdg-state/state"
theme nord > "$TEST_LOG/output"
[[ $(cat "$XDG_STATE_HOME/hrmnjt-dev/theme") == nord && ! -e "$selection" ]]
unset XDG_STATE_HOME
printf 'PASSED: xdg-state\n'

new_home real-overlay
printf 'font-size = 20\n' > "$overlay"
if theme nord > "$TEST_LOG/output" 2>&1; then exit 1; fi
[[ $(cat "$overlay") == "font-size = 20" ]]
untouched
printf 'PASSED: real-overlay\n'

new_home folded-ghostty
rm -r "$HOME/.config/ghostty"
mkdir -p "$tmp/folded-ghostty/repo-ghostty"
ln -s "$tmp/folded-ghostty/repo-ghostty" "$HOME/.config/ghostty"
if theme nord > "$TEST_LOG/output" 2>&1; then exit 1; fi
[[ ! -e "$tmp/folded-ghostty/repo-ghostty/theme.local" ]]
untouched
printf 'PASSED: folded-ghostty\n'

new_home undeployed
rm "$HOME/.config/ghostty/nord.conf" "$HOME/.local/share/wallpapers/dota-2-nord-dark.jpg"
TEST_BORDERS_STATUS=1 theme nord > "$TEST_LOG/output"
[[ $(cat "$selection") == nord && ! -L "$overlay" && ! -e "$TEST_LOG/borders" ]]
[[ $(wc -l < "$TEST_LOG/osascript" | tr -d ' ') == 1 ]] # dark mode only
printf 'PASSED: undeployed\n'

new_home not-macos
TEST_UNAME=Linux theme nord > "$TEST_LOG/output"
[[ $(cat "$selection") == nord && $(readlink "$overlay") == nord.conf ]]
[[ ! -e "$TEST_LOG/osascript" && ! -e "$TEST_LOG/defaults" && ! -e "$TEST_LOG/borders" ]]
printf 'PASSED: not-macos\n'

# Zsh: run the theme block from .zshrc against Stow-like links in a new home.
if command -v zsh > /dev/null 2>&1; then
  new_home zsh
  export XDG_CONFIG_HOME="$HOME/.config"
  mkdir -p "$XDG_CONFIG_HOME/lazygit" "$XDG_CONFIG_HOME/glow/themes"
  ln -s "$repo/starship/.config/starship.toml" "$XDG_CONFIG_HOME/starship.toml"
  for file in config.yml nord.yml; do
    ln -s "$repo/lazygit/.config/lazygit/$file" "$XDG_CONFIG_HOME/lazygit/$file"
  done
  for file in gruvbox-dark-hard.json nord.json; do
    ln -s "$repo/glow/.config/glow/themes/$file" "$XDG_CONFIG_HOME/glow/themes/$file"
  done
  awk '/^_theme_file=/ { p = 1 } p { print } /^add-zsh-hook precmd _theme_apply$/ { exit }' \
    "$repo/zsh/.zshrc" > "$tmp/theme.zsh"
  grep -F '_theme_apply() {' "$tmp/theme.zsh" > /dev/null
  cat > "$tmp/check.zsh" <<'ZSH'
source "$1"
prompt() { local f; for f in $precmd_functions; do $f; done; }
gruvbox() {
  [[ $GLOW_STYLE == $HOME/.config/glow/themes/gruvbox-dark-hard.json ]] &&
    [[ $FZF_DEFAULT_OPTS == *bg:#1d2021* && -z ${LG_CONFIG_FILE+set} && -z ${STARSHIP_CONFIG+set} ]]
}
gruvbox || { print "default is not gruvbox"; exit 1; }
mkdir -p "${_theme_file:h}"
print nord > "$_theme_file"
prompt
[[ $GLOW_STYLE == $XDG_CONFIG_HOME/glow/themes/nord.json && $FZF_DEFAULT_OPTS == *bg:#2e3440* ]] ||
  { print "nord fzf/glow"; exit 1; }
[[ $LG_CONFIG_FILE == $XDG_CONFIG_HOME/lazygit/config.yml,$XDG_CONFIG_HOME/lazygit/nord.yml ]] ||
  { print "nord lazygit: $LG_CONFIG_FILE"; exit 1; }
[[ -f $STARSHIP_CONFIG ]] && grep -qx "palette = 'nord'" "$STARSHIP_CONFIG" ||
  { print "nord starship"; exit 1; }
diff <(grep -v '^palette = ' "$XDG_CONFIG_HOME/starship.toml") <(grep -v '^palette = ' "$STARSHIP_CONFIG") ||
  { print "starship copy differs beyond its palette"; exit 1; }
print gruvbox > "$_theme_file"
prompt
gruvbox || { print "switch back to gruvbox"; exit 1; }
# Nord files Stow hasn't deployed yet fall back to Gruvbox.
rm "$XDG_CONFIG_HOME/lazygit/nord.yml" "$XDG_CONFIG_HOME/glow/themes/nord.json"
print nord > "$_theme_file"
prompt
[[ -z ${LG_CONFIG_FILE+set} && $GLOW_STYLE == *gruvbox-dark-hard.json && $FZF_DEFAULT_OPTS == *bg:#2e3440* ]] ||
  { print "undeployed fallback"; exit 1; }
ZSH
  zsh -f "$tmp/check.zsh" "$tmp/theme.zsh"
  if command -v python3 > /dev/null 2>&1; then
    python3 -I - "$HOME/.local/state/hrmnjt-dev/starship-nord.toml" <<'PY'
import sys, tomllib
config = tomllib.load(open(sys.argv[1], "rb"))
palettes = config["palettes"]
assert config["palette"] == "nord", config["palette"]
assert palettes["nord"].keys() == palettes["gruvbox_dark"].keys(), "palette keys differ"
PY
  fi
  unset XDG_CONFIG_HOME
  printf 'PASSED: zsh\n'
else
  printf 'SKIPPED: zsh (zsh unavailable)\n'
fi

# Neovim: evaluate the plugin spec with Neovim, or any Lua with a vim.env stub.
# The spec and lazy.lua's install screen share config.theme from arg[3].
cat > "$tmp/check.lua" <<'LUA'
if not vim then
  vim = { env = setmetatable({}, { __index = function(_, key) return os.getenv(key) end }) }
end
package.path = arg[3] .. "/?.lua;" .. package.path
local got
for _, plugin in ipairs(dofile(arg[1])) do
  if plugin[1] == "LazyVim/LazyVim" then got = plugin.opts.colorscheme end
end
local install = require("config.theme").selected()
if got ~= arg[2] or install ~= arg[2] then
  io.stderr:write(("expected %s, got %s (install: %s)\n"):format(arg[2], tostring(got), tostring(install)))
  os.exit(1)
end
LUA
lua_check=()
if command -v nvim > /dev/null 2>&1; then
  lua_check=(nvim --clean -l)
else
  for name in lua lua5.4 lua5.3 luajit; do
    if command -v "$name" > /dev/null 2>&1; then lua_check=("$name"); break; fi
  done
fi
if (( ${#lua_check[@]} )); then
  new_home nvim
  lua_dir="$repo/nvim/.config/nvim/lua" spec="$repo/nvim/.config/nvim/lua/plugins/theme.lua"
  "${lua_check[@]}" "$tmp/check.lua" "$spec" gruvbox "$lua_dir"
  theme nord > "$TEST_LOG/output"
  "${lua_check[@]}" "$tmp/check.lua" "$spec" nord "$lua_dir"
  printf 'garbage\n' > "$selection"
  "${lua_check[@]}" "$tmp/check.lua" "$spec" gruvbox "$lua_dir"
  grep -F 'colorscheme = { require("config.theme").selected(), "habamax" }' \
    "$lua_dir/config/lazy.lua" > /dev/null
  printf 'PASSED: nvim (%s)\n' "${lua_check[0]}"
else
  printf 'SKIPPED: nvim (no nvim or Lua)\n'
fi

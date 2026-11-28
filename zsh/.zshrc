# Importing things that I want to keep locally
[[ -f ~/.zshrc.local ]] && source ~/.zshrc.local

# Claude always enters through the shared VM launcher, even if a Mac binary or
# a local PATH customization would otherwise shadow the Stow wrapper. Pi is not
# wrapped: its installer owns `pi`, and the Gondolin extension routes its tools.
claude() { command "$HOME/.local/bin/agent-vm" claude "$@" }

# Homebrew is initialized once for login shells in ~/.zprofile.

# Keep useful history across shells while removing duplicate commands. Shared
# history makes commands available to other active shells as they are entered.
HISTFILE="${ZDOTDIR:-$HOME}/.zsh_history"
HISTSIZE=50000
SAVEHIST=50000
setopt append_history
setopt extended_history
setopt hist_expire_dups_first
setopt hist_find_no_dups
setopt hist_ignore_all_dups
setopt hist_ignore_space
setopt hist_reduce_blanks
setopt hist_save_no_dups
setopt share_history

# Initialize Zsh's native completion system before tool-specific integrations.
autoload -Uz compinit
compinit

# starship.rs prompt
# https://starship.rs/guide/
eval "$(starship init zsh)"

# Reload shell safely. `source ~/.zshrc` breaks Ghostty shell integration.
alias loadshell='exec zsh -l'

# Using eza instead of ls for an extra l command
alias l='eza --all --git --long --show-symlinks'

# Databricks Asset Bundles
dab() {
  databricks bundle "$@"
}

# Java for local Spark (work ingestion tests). openjdk@17 is keg-only, so point
# JAVA_HOME straight at Contents/Home instead of relying on the system wrapper
# (/usr/libexec/java_home), which would need a sudo symlink into
# /Library/Java/JavaVirtualMachines.
[[ -d /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ]] &&
  export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"

# git folder navigation
alias cdp='cd ~/code/github.com/hrmnjt'
alias cdw='cd ~/code/work/doh'

# Delete local branches whose upstream is gone and are merged into the current branch.
alias gbclean='git fetch --prune && git branch -vv --merged | awk '\''$1 != "*" && /: gone]/{print $1}'\'' | while read -r branch; do git branch -d "$branch"; done'

# Open the history file to remove an accidentally recorded command, then switch
# this shell to the edited history. Close other shells first so their in-memory
# histories cannot restore the removed entry later.
histedit() {
  local editor="${VISUAL:-${EDITOR:-vi}}"

  fc -W "$HISTFILE" || return 1
  "$editor" "$HISTFILE" || return 1
  fc -p "$HISTFILE"
  print -- "history reloaded from $HISTFILE"
}

# Router lifecycle and status command. Invoke through sh so the Stow link does
# not depend on the source file's executable mode.
alias llm='/bin/sh "$HOME/.local/bin/llm"'

# Theme for fzf, Glow, Lazygit and Starship: Gruvbox Dark Hard unless
# `just theme nord` selected Nord. This block owns the four variables below.
# Rereading the one-line selection before each prompt lets open shells follow
# a switch; see NORD.md.
_theme_file="${XDG_STATE_HOME:-$HOME/.local/state}/hrmnjt-dev/theme"
_theme_apply() {
  local theme=gruvbox
  [[ -r $_theme_file ]] && read -r theme < "$_theme_file"
  [[ $theme == nord ]] || theme=gruvbox
  [[ $theme == ${_theme_current-} ]] && return
  _theme_current=$theme

  if [[ $theme == nord ]]; then
    export FZF_DEFAULT_OPTS=" \
--color=bg:#2e3440,bg+:#3b4252,fg:#d8dee9,fg+:#eceff4 \
--color=hl:#88c0d0,hl+:#8fbcbb,header:#a3be8c,info:#81a1c1 \
--color=prompt:#ebcb8b,pointer:#88c0d0,marker:#a3be8c,spinner:#8fbcbb \
--color=border:#4c566a,label:#d8dee9,separator:#434c5e \
--color=selected-bg:#434c5e"
  else
    export FZF_DEFAULT_OPTS=" \
--color=bg:#1d2021,bg+:#282828,fg:#ebdbb2,fg+:#fbf1c7 \
--color=hl:#d65d0e,hl+:#fe8019,header:#98971a,info:#458588 \
--color=prompt:#d79921,pointer:#d65d0e,marker:#689d6a,spinner:#689d6a \
--color=border:#665c54,label:#ebdbb2,separator:#504945 \
--color=selected-bg:#3c3836"
  fi

  # Glow needs an absolute style path; $HOME keeps it out of glow.yml. Each
  # Nord file is used only once Stow has deployed it.
  local glow="$HOME/.config/glow/themes"
  if [[ $theme == nord && -r $glow/nord.json ]]; then
    export GLOW_STYLE="$glow/nord.json"
  else
    export GLOW_STYLE="$glow/gruvbox-dark-hard.json"
  fi

  # Lazygit merges listed files in order and stops if one is missing.
  local lazygit="${XDG_CONFIG_HOME:-$HOME/.config}/lazygit"
  if [[ $theme == nord && -r $lazygit/nord.yml ]]; then
    export LG_CONFIG_FILE="$lazygit/config.yml,$lazygit/nord.yml"
  else
    unset LG_CONFIG_FILE
  fi

  # Starship has no include or palette variable, so Nord uses a copy of the
  # tracked config with its palette line switched, refreshed when it changes.
  local starship="${XDG_CONFIG_HOME:-$HOME/.config}/starship.toml"
  local starship_nord="${_theme_file:h}/starship-nord.toml"
  if [[ $theme == nord && -r $starship ]] &&
    [[ ! -f $starship_nord || $starship -nt $starship_nord ]]; then
    sed "s/^palette = .*/palette = 'nord'/" "$starship" > "$starship_nord.$$" &&
      mv -f "$starship_nord.$$" "$starship_nord" || rm -f "$starship_nord.$$"
  fi
  if [[ $theme == nord && -f $starship_nord ]]; then
    export STARSHIP_CONFIG=$starship_nord
  else
    unset STARSHIP_CONFIG
  fi
}
_theme_apply
autoload -Uz add-zsh-hook
add-zsh-hook precmd _theme_apply

# fzf's official Zsh integration provides Ctrl-R history search, Ctrl-T file
# search, Alt-C directory navigation, and completion. Keep startup usable when
# fzf has not yet been installed on a newly bootstrapped Mac.
if command -v fzf >/dev/null 2>&1; then
  source <(fzf --zsh)
fi

# Ghostty shell integration
#
# Ghostty auto-injects this only for shells it directly spawns. Re-exec'd shells
# (for example via `loadshell`) need to source it explicitly so cwd reporting
# keeps working for new tabs/splits.
if [[ "$TERM_PROGRAM" == "ghostty" ]]; then
  if [[ -n "$GHOSTTY_RESOURCES_DIR" && -r "$GHOSTTY_RESOURCES_DIR/shell-integration/zsh/ghostty-integration" ]]; then
    source "$GHOSTTY_RESOURCES_DIR/shell-integration/zsh/ghostty-integration"
  elif [[ -r "/Applications/Ghostty.app/Contents/Resources/ghostty/shell-integration/zsh/ghostty-integration" ]]; then
    source "/Applications/Ghostty.app/Contents/Resources/ghostty/shell-integration/zsh/ghostty-integration"
  fi
fi

# Lightweight interactive feedback, sourced directly without a plugin manager.
# Homebrew sets HOMEBREW_PREFIX in .zprofile; guards keep bootstrap shells usable
# until the formulas are installed. Syntax highlighting must remain last.
if [[ -n "$HOMEBREW_PREFIX" ]]; then
  [[ -r "$HOMEBREW_PREFIX/share/zsh-autosuggestions/zsh-autosuggestions.zsh" ]] &&
    source "$HOMEBREW_PREFIX/share/zsh-autosuggestions/zsh-autosuggestions.zsh"
  [[ -r "$HOMEBREW_PREFIX/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" ]] &&
    source "$HOMEBREW_PREFIX/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
fi

# Importing things that I want to keep locally
[[ -f ~/.zshrc.local ]] && source ~/.zshrc.local

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
setopt hist_reduce_blanks
setopt hist_save_no_dups
setopt share_history

# Initialize Zsh's native completion system before tool-specific integrations.
autoload -Uz compinit
compinit

# Gondolin custom VM image (built with `just gondolin-image`)
export GONDOLIN_GUEST_DIR="$HOME/.gondolin/custom-image"

# Share GitHub CLI auth with the Gondolin sandbox; the guest env inherits this
# so the agent can raise PRs (see gh/README.md). Guarded so shell startup stays
# quiet when gh is missing or unauthenticated.
command -v gh >/dev/null 2>&1 && export GH_TOKEN="$(gh auth token 2>/dev/null)"

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

# git worktree helper
[[ -f ~/.config/zsh/wt.zsh ]] && source ~/.config/zsh/wt.zsh

# Router lifecycle and status command. Invoke through sh so the Stow link does
# not depend on the source file's executable mode.
alias llm='/bin/sh "$HOME/.local/bin/llm"'

# fzf theme: Gruvbox Dark Hard, matching Ghostty and Starship.
export FZF_DEFAULT_OPTS=" \
--color=bg:#1d2021,bg+:#282828,fg:#ebdbb2,fg+:#fbf1c7 \
--color=hl:#d65d0e,hl+:#fe8019,header:#98971a,info:#458588 \
--color=prompt:#d79921,pointer:#d65d0e,marker:#689d6a,spinner:#689d6a \
--color=border:#665c54,label:#ebdbb2,separator:#504945 \
--color=selected-bg:#3c3836"

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

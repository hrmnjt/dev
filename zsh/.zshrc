# Importing things that I want to keep locally
[[ -f ~/.zshrc.local ]] && source ~/.zshrc.local

# Homebrew stuff
eval "$(/opt/homebrew/bin/brew shellenv)"
export HOMEBREW_NO_AUTO_UPDATE=1

# Gondolin custom VM image (built with `just gondolin-image`)
export GONDOLIN_GUEST_DIR="$HOME/.gondolin/custom-image"

# starship.rs prompt
# https://starship.rs/guide/
eval "$(starship init zsh)"

# Reload shell safely. `source ~/.zshrc` breaks Ghostty shell integration.
alias loadshell='exec zsh -l'

# Using eza instead of ls for an extra l command
alias l='eza --all --git --long --show-symlinks'

alias pass='cat ~/.pass | pbcopy'

# Databricks Asset Bundles
dab() {
  databricks bundle "$@"
}

# git folder navigation
alias cdp='cd ~/code/github.com/hrmnjt'
alias cdw='cd ~/code/work/doh'

# Delete local branches whose upstream is gone and are merged into the current branch.
alias gbclean='git fetch --prune && git branch -vv --merged | awk '\''$1 != "*" && /: gone]/{print $1}'\'' | while read -r branch; do git branch -d "$branch"; done'

# git worktree helper
[[ -f ~/.config/zsh/wt.zsh ]] && source ~/.config/zsh/wt.zsh

# pi + Hunk review bridge
[[ -f ~/.config/zsh/pihunk.zsh ]] && source ~/.config/zsh/pihunk.zsh

# fzf theme: Gruvbox Dark Hard, matching Ghostty and Starship.
export FZF_DEFAULT_OPTS=" \
--color=bg:#1d2021,bg+:#282828,fg:#ebdbb2,fg+:#fbf1c7 \
--color=hl:#d65d0e,hl+:#fe8019,header:#98971a,info:#458588 \
--color=prompt:#d79921,pointer:#d65d0e,marker:#689d6a,spinner:#689d6a \
--color=border:#665c54,label:#ebdbb2,separator:#504945 \
--color=selected-bg:#3c3836"

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

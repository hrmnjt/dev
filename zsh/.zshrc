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

# git folder navigation
alias cdp='cd ~/code/github.com/hrmnjt'
alias cdw='cd ~/code/work/doh'

# git worktree helper
[[ -f ~/.config/zsh/wt.zsh ]] && source ~/.config/zsh/wt.zsh

# pi + Hunk review bridge
[[ -f ~/.config/zsh/pihunk.zsh ]] && source ~/.config/zsh/pihunk.zsh

export FZF_DEFAULT_OPTS=" \
--color=bg+:#313244,bg:#1E1E2E,spinner:#F5E0DC,hl:#F38BA8 \
--color=fg:#CDD6F4,header:#F38BA8,info:#CBA6F7,pointer:#F5E0DC \
--color=marker:#B4BEFE,fg+:#CDD6F4,prompt:#CBA6F7,hl+:#F38BA8 \
--color=selected-bg:#45475A \
--color=border:#6C7086,label:#CDD6F4"

# amp
export PATH="$HOME/.local/bin:$PATH"

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

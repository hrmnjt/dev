
# Homebrew stuff
eval "$(/opt/homebrew/bin/brew shellenv)"
export HOMEBREW_NO_AUTO_UPDATE=1

# direnv
eval "$(direnv hook zsh)"

# starship.rs prompt
# https://starship.rs/guide/
eval "$(starship init zsh)"

alias loadshell='source ~/.zshrc'

alias l='eza --all --git --long --show-symlinks'

alias pass='cat ~/.pass | pbcopy'

# git folder navigation
alias cdp='cd ~/code/github.com/hrmnjt'
alias cdw='cd ~/code/work/doh'

export FZF_DEFAULT_OPTS=" \
--color=bg+:#313244,bg:#1E1E2E,spinner:#F5E0DC,hl:#F38BA8 \
--color=fg:#CDD6F4,header:#F38BA8,info:#CBA6F7,pointer:#F5E0DC \
--color=marker:#B4BEFE,fg+:#CDD6F4,prompt:#CBA6F7,hl+:#F38BA8 \
--color=selected-bg:#45475A \
--color=border:#6C7086,label:#CDD6F4"

# amp
export PATH="$HOME/.local/bin:$PATH"

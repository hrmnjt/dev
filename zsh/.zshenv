# .zshenv

export XDG_CONFIG_HOME="$HOME/.config"

# Use Neovim for programs that open a terminal editor.
export EDITOR="nvim"
export VISUAL="nvim"

case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) export PATH="$HOME/.local/bin:$PATH" ;;
esac

# Used by ~/.local/bin/vpn.
export IVANTI_VPN_NAME="${IVANTI_VPN_NAME:-DOH VPN}"


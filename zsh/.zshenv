# .zshenv

export XDG_CONFIG_HOME="$HOME/.config"

case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) export PATH="$HOME/.local/bin:$PATH" ;;
esac

# Used by ~/.local/bin/vpn.
export IVANTI_VPN_NAME="${IVANTI_VPN_NAME:-DOH VPN}"


#!/usr/bin/env bash
set -euo pipefail

DATE=$(date +%Y%m%d)
KEY_PATH="$HOME/.ssh/id_ed25519_github_${DATE}"
COMMENT="$(whoami)@$(hostname -s)"

# Check if key already exists
if [[ -f "$KEY_PATH" ]]; then
    echo "Key already exists at ${KEY_PATH}"
    echo "Delete it first if you want to regenerate: rm ${KEY_PATH} ${KEY_PATH}.pub"
    exit 1
fi

# Generate SSH key
echo "Generating SSH key at ${KEY_PATH}..."
ssh-keygen -t ed25519 -a 100 -f "$KEY_PATH" -C "$COMMENT"

# Ensure SSH config exists and add Github host config
mkdir -p ~/.ssh
if ! grep -q "Host github.com" ~/.ssh/config 2>/dev/null; then
    echo "Adding Github config to ~/.ssh/config..."
    cat >> ~/.ssh/config << EOF

Host github.com
  AddKeysToAgent yes
  IdentityFile ${KEY_PATH}
EOF
else
    echo "Github host already exists in ~/.ssh/config - update IdentityFile manually if needed"
fi

# Start ssh-agent and add key to Apple Keychain
eval "$(ssh-agent -s)"
ssh-add --apple-use-keychain "$KEY_PATH"

# Copy public key to clipboard
pbcopy < "${KEY_PATH}.pub"
echo ""
echo "Public key copied to clipboard!"
echo "Add it to Github: https://github.com/settings/keys"
echo "Store passphrase in Bitwarden"
echo ""
echo "Test with: ssh -T git@github.com"

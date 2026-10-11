#!/usr/bin/env bash
set -euo pipefail

# Optional path reuses an existing key; otherwise use the dated GitHub key.
if [[ $# -gt 1 || "${1:-}" == --help ]]; then
    echo "Usage: $0 [existing-key-path]"
    [[ $# -le 1 ]] && exit 0 || exit 2
fi
DATE=$(date +%Y%m%d)
KEY_PATH="${1:-$HOME/.ssh/id_ed25519_github_${DATE}}"
[[ "$KEY_PATH" == /* ]] || KEY_PATH="$PWD/$KEY_PATH"
COMMENT="$(whoami)@$(hostname -s)"
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

if [[ -f "$KEY_PATH" ]]; then
    [[ -f "${KEY_PATH}.pub" ]] || { echo "Public key missing for $KEY_PATH; restore it before setup." >&2; exit 1; }
    echo "Reusing key at ${KEY_PATH}"
else
    echo "Generating SSH key at ${KEY_PATH}..."
    ssh-keygen -t ed25519 -a 100 -f "$KEY_PATH" -C "$COMMENT"
fi

# A leading, managed host block makes Keychain options effective even when a
# prior Host * block sets them otherwise. Host * restores the original global
# scope, while all user host entries (including IdentityFile) remain intact.
config="$HOME/.ssh/config"
clean_config=$(mktemp "$HOME/.ssh/config.clean.XXXXXX")
updated_config=$(mktemp "$HOME/.ssh/config.updated.XXXXXX")
trap 'rm -f "$clean_config" "$updated_config"' EXIT
if [[ -f "$config" ]]; then
    if ! awk '
      /^# BEGIN hrmnjt-dev GitHub Keychain$/ { if (owned) invalid = 1; owned = 1; next }
      /^# END hrmnjt-dev GitHub Keychain$/ { if (!owned) invalid = 1; owned = 0; next }
      !owned { print }
      END { if (owned || invalid) exit 1 }
    ' "$config" > "$clean_config"; then
        echo "Unbalanced managed Keychain markers in $config; leaving it unchanged." >&2
        exit 1
    fi
fi
has_github=false
if awk 'tolower($1) == "host" { for (i = 2; i <= NF; i++) if ($i == "github.com") found = 1 }
    END { exit !found }' "$clean_config"; then
    has_github=true
fi
{
    printf '# BEGIN hrmnjt-dev GitHub Keychain\nHost github.com\n  AddKeysToAgent yes\n  UseKeychain yes\n'
    if [[ "$has_github" == false ]]; then
        escaped_path=${KEY_PATH//\\/\\\\}
        escaped_path=${escaped_path//\"/\\\"}
        printf '  IdentityFile "%s"\n' "$escaped_path"
    fi
    printf 'Host *\n# END hrmnjt-dev GitHub Keychain\n'
    cat "$clean_config"
} > "$updated_config"
# Preserve existing dotfile symlinks rather than replacing their deployment.
if [[ -L "$config" ]]; then
    cat "$updated_config" > "$config"
else
    mv "$updated_config" "$config"
fi
chmod 600 "$config"
if [[ "$has_github" == true ]]; then
    echo "Existing GitHub IdentityFile settings preserved; update them manually if choosing this key."
fi

# ssh-add returns 1 for a reachable empty agent and 2 for an unreachable agent.
agent_status=0
ssh-add -l >/dev/null 2>&1 || agent_status=$?
if [[ "$agent_status" -gt 1 ]]; then
    eval "$(ssh-agent -s)"
fi
ssh-add --apple-use-keychain "$KEY_PATH"

pbcopy < "${KEY_PATH}.pub"
echo ""
echo "Public key copied to clipboard!"
echo "Add it to GitHub: https://github.com/settings/keys"
echo "Store passphrase in Bitwarden"
echo "Test with: ssh -T git@github.com"

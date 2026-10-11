#!/usr/bin/env bash
# Exercise the real setup script with fake keygen, agent, Keychain and clipboard.
set -euo pipefail
repo=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/sshsetup-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
cat > "$tmp/bin/ssh-keygen" <<'SH'
#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = -f ]; then key=$2; break; fi
  shift
done
printf 'fake private key\n' > "$key"
printf 'ssh-ed25519 fake-fixture\n' > "$key.pub"
printf 'generated\n' >> "$TEST_LOG/keygen"
SH
cat > "$tmp/bin/ssh-add" <<'SH'
#!/bin/sh
if [ "$1" = -l ]; then exit "$TEST_AGENT_STATUS"; fi
[ "$1" = --apple-use-keychain ] || exit 2
printf '%s\n' "$2" >> "$TEST_LOG/added"
SH
cat > "$tmp/bin/ssh-agent" <<'SH'
#!/bin/sh
printf 'started\n' >> "$TEST_LOG/agents"
printf 'SSH_AUTH_SOCK="%s/agent.sock"; export SSH_AUTH_SOCK; SSH_AGENT_PID=123; export SSH_AGENT_PID;\n' "$HOME"
SH
cat > "$tmp/bin/pbcopy" <<'SH'
#!/bin/sh
cat > "$TEST_LOG/clipboard"
SH
chmod +x "$tmp/bin/"*
export PATH="$tmp/bin:$PATH"
for kind in new loaded-agent empty-agent stale-agent existing-config symlink-config; do
  export HOME="$tmp/$kind/home with spaces" TEST_LOG="$tmp/$kind/log" SSH_AUTH_SOCK="$tmp/socket"
  export TEST_AGENT_STATUS=0
  mkdir -p "$HOME/.ssh" "$TEST_LOG"
  case "$kind" in
    empty-agent) TEST_AGENT_STATUS=1 ;;
    new|stale-agent) TEST_AGENT_STATUS=2 ;;
  esac
  config="$HOME/.ssh/config"
  if [[ "$kind" == existing-config || "$kind" == symlink-config ]]; then
    printf 'Host *\n  AddKeysToAgent no\n  UseKeychain no\n  Port 2222\nHost example.com github.com\n  IdentityFile "existing-key"\n' > "$TEST_LOG/original"
    if [[ "$kind" == symlink-config ]]; then
      cp "$TEST_LOG/original" "$TEST_LOG/config-source"
      ln -s "$TEST_LOG/config-source" "$config"
    else
      cp "$TEST_LOG/original" "$config"
    fi
  fi
  bash "$repo/_scripts/sshsetup.sh" > "$TEST_LOG/output" 2>&1
  cp "$config" "$TEST_LOG/first-config"
  # Re-run with the dated key still present; no key overwrite or duplicate block.
  bash "$repo/_scripts/sshsetup.sh" > "$TEST_LOG/output-again" 2>&1
  cmp "$config" "$TEST_LOG/first-config"
  [[ $(wc -l < "$TEST_LOG/keygen" | tr -d ' ') == 1 ]]
  [[ $(grep -c '^# BEGIN hrmnjt-dev GitHub Keychain$' "$config") == 1 ]]
  if [[ "$TEST_AGENT_STATUS" -gt 1 ]]; then
    [[ $(wc -l < "$TEST_LOG/agents" | tr -d ' ') == 2 ]]
  else
    [[ ! -e "$TEST_LOG/agents" ]]
  fi
  [[ $(wc -l < "$TEST_LOG/added" | tr -d ' ') == 2 ]]
  if [[ -f "$TEST_LOG/original" ]]; then
    awk 'found { print } /^# END hrmnjt-dev GitHub Keychain$/ { found = 1 }' "$config" > "$TEST_LOG/preserved"
    cmp "$TEST_LOG/original" "$TEST_LOG/preserved"
  fi
  if [[ "$kind" == symlink-config ]]; then [[ -L "$config" ]]; fi
  # Parse only this disposable config; -G doesn't connect or use a real key.
  ssh -G -F "$config" -o IgnoreUnknown=UseKeychain github.com > "$TEST_LOG/effective" 2>/dev/null
  grep -Eq '^addkeystoagent (true|yes)$' "$TEST_LOG/effective"
  if [[ -f "$TEST_LOG/original" ]]; then
    grep -F 'identityfile existing-key' "$TEST_LOG/effective" >/dev/null
    grep -F 'port 2222' "$TEST_LOG/effective" >/dev/null
  else
    grep -F "identityfile $HOME/.ssh/id_ed25519_github_" "$TEST_LOG/effective" >/dev/null
  fi
  printf 'PASSED: %s\n' "$kind"
done
# Explicit key path support and refusal to replace a key with no public half.
export HOME="$tmp/explicit/home" TEST_LOG="$tmp/explicit/log" TEST_AGENT_STATUS=0
mkdir -p "$HOME/.ssh" "$TEST_LOG"
printf 'private\n' > "$HOME/.ssh/chosen"
printf 'public\n' > "$HOME/.ssh/chosen.pub"
bash "$repo/_scripts/sshsetup.sh" "$HOME/.ssh/chosen" > "$TEST_LOG/output" 2>&1
[[ ! -e "$TEST_LOG/keygen" ]]
rm "$HOME/.ssh/chosen.pub"
if bash "$repo/_scripts/sshsetup.sh" "$HOME/.ssh/chosen" > "$TEST_LOG/error" 2>&1; then
  printf 'FAILED: missing public key guard\n' >&2; exit 1
fi
printf 'PASSED: explicit existing key and missing public key guard\n'
printf 'public\n' > "$HOME/.ssh/chosen.pub"
printf '# BEGIN hrmnjt-dev GitHub Keychain\nHost important.example\n  Port 2222\n' > "$HOME/.ssh/config"
cp "$HOME/.ssh/config" "$TEST_LOG/malformed"
if bash "$repo/_scripts/sshsetup.sh" "$HOME/.ssh/chosen" > "$TEST_LOG/error" 2>&1; then
  printf 'FAILED: malformed managed block guard\n' >&2; exit 1
fi
cmp "$HOME/.ssh/config" "$TEST_LOG/malformed"
printf 'PASSED: malformed managed block leaves user config unchanged\n'
printf '8 SSH setup regression checks passed\n'

# Gh

Preferences for the [GitHub CLI](https://cli.github.com/), used for PRs,
issues, and reviews from the host terminal.
The tracked config only carries non-secret preferences, matching the SSH-based
Git workflow in [Git](../git/README.md).

The tracked Zsh environment sets `XDG_CONFIG_HOME=~/.config`, so Stow deploys:

```text
gh/.config/gh/config.yml -> ~/.config/gh/config.yml
```

## What is tracked vs. secret

| File | Contents | Tracked? |
|---|---|---|
| `~/.config/gh/config.yml` | Preferences (`git_protocol`, aliases) | Yes |
| `~/.config/gh/hosts.yml` | Account and auth state | Never — token material |

`gh config` is global, not per-repo. Commit identity still comes from the
layered Git config in [Git](../git/README.md); `git_protocol: ssh` only makes
`gh` generate SSH remotes so cloned repos reuse the GitHub SSH key.

## Install

Run on the host Mac from the repository root:

```bash
brew bundle install
just stowall

# Authenticate over SSH, reusing the key from ./_scripts/sshsetup.sh
gh auth login
gh config set git_protocol ssh   # default comes from config.yml after stow
gh auth status
```

## Agent VM usage

Pi's model tools and typed `claude` use guest `gh`, not this host login.
The launcher supplies a scoped GitHub token placeholder from the Mac Keychain
and rewrites GitHub SSH remotes to HTTPS. Do not run `gh auth login` inside a
work VM or print tokens. See [VM credentials and rulesets](../gondolin/README.md#host-credentials).

Host `gh` continues to use its stored login. Remove any old `GH_TOKEN` shell
export that existed only for the retired VM setup; the launcher does not forward it.

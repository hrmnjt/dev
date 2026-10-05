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

# Authenticate over SSH, reusing the key from just ghsshkey
gh auth login
gh config set git_protocol ssh   # default comes from config.yml after stow
gh auth status
```

## Pi usage

Pi's native bash tool can use normal networking and the existing CLI login for
requested PR creation, checks, and reviews. Its filesystem writes remain confined
to the launch directory, private scratch, and Git metadata. Initial authentication
and changes to host-global configuration still need a host terminal because those
files are outside the write boundary. Do not print tokens or authentication state.
See [the Pi package guide](../pi/README.md#native-sandbox).

Zsh no longer exports `GH_TOKEN` for a VM. Host `gh` uses its stored login;
no new authentication is required. If a current shell inherited a token solely
from the retired export, unset `GH_TOKEN` there to stop passing it to children.

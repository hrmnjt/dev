# Gh

Preferences for the [GitHub CLI](https://cli.github.com/), used for PRs,
issues, and reviews from both the host terminal and the pi Gondolin sandbox.
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
just brewinst
just stowall

# Authenticate over SSH, reusing the key from just ghsshkey
gh auth login
gh config set git_protocol ssh   # default comes from config.yml after stow
gh auth status
```

## Pi / Gondolin usage

`gh` is part of the custom Gondolin image
([pi/README.md](../pi/README.md)), so the assistant can raise PRs and inspect
checks from inside the VM. The guest cannot run `gh auth login`, so share the
host token through the environment before starting pi:

```bash
export GH_TOKEN="$(gh auth token)"   # already exported by zsh/.zshrc
```

Host-side operations (interactive `gh auth login`, browser-based reviews) run
with `!` / `!!` from pi, which stay on the host.

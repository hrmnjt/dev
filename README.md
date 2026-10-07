# sudo make me a sandwich!

## What is in this repo?

- Ingredients...
- ...prepared the way I like it...
- ...so that, I handcraft my sandwich...
- ...quickly, even in a new kitchen

It also reminds me how I like my sandwich, coz sometimes I forget.

Borrowed from [XKCD 149](https://xkcd.com/149/), BTW.

## What is this not?

- stuff that might not suit your workflow!
- might not work for anything other than macosx as of now.

## for future Harman

### Complete the macOS first-run tasks

```bash
# 1. Sign in to iCloud.

# 2. Install all available updates from System Settings → General → Software Update.

# 3. Set the Mac hostname, replacing xxx when needed:
sudo scutil --set ComputerName "Ghost XXX"
sudo scutil --set LocalHostName "ghost-xxx"
sudo scutil --set HostName "ghost-xxx"

# 4. Install Homebrew and the bootstrap tools
# Install Homebrew from https://brew.sh/

# Make it available in the current shell
eval "$(/opt/homebrew/bin/brew shellenv)"

# 5. Install tools to bootstrap the repo
brew install just stow

# 6. Clone the repository
mkdir -p ~/code/github.com/hrmnjt
git clone https://github.com/hrmnjt/dev.git ~/code/github.com/hrmnjt/dev
cd ~/code/github.com/hrmnjt/dev

# Create the repository-local, Git-ignored model cache
mkdir -p _models

# 7. Install everything tracked in Brewfile
brew bundle install

# 8. Deploy the dotfiles
just stowall

# 9. Install and configure Pi
# 9.1. Pi - https://pi.dev/docs/latest/quickstart#install
# 9.2. Reconcile Pi package metadata and remove retired backend dependencies
npm install --prefix ~/.pi/agent
# 9.3. Initialize Pi's intentional settings
if [[ ! -f ~/.pi/agent/settings.json ]]; then
  cp ~/.pi/agent/settings.template.json ~/.pi/agent/settings.json
fi
# 9.4. Pi uses the native macOS sandbox; see pi/README.md for migration and checks
# 9.5. Sign in to Claude Code (installed by brew, configured by stow);
# see claude/README.md
claude
claude doctor
# Restart the login shell, then continue with step 10
exec zsh -l

# 10. Configure Git and GitHub SSH
mkdir -p ~/code/work/doh
just ghsshkey
# Add the copied public key at https://github.com/settings/keys
ssh -T git@github.com
# After SSH authentication succeeds, update this checkout:
git remote set-url origin git@github.com:hrmnjt/dev.git

# 10.1. Authenticate the GitHub CLI over SSH; see gh/README.md
gh auth login

# 11. Complete required app permissions
# 11.1. Grant AeroSpace Accessibility permission; see the aerospace/README.md
# 11.2. Grant Ghostty or the active terminal Accessibility and Automation
# permissions when using the Ivanti VPN commands; see the ivanti/README.md
# 11.3. Sign in to required browser, email, messaging, and work applications

# 12. Gruvbox macOS appearance
just macos-gruvbox

# 12.1. Review and apply intentional behavioral defaults
./_scripts/macos-defaults.sh preview
./_scripts/macos-defaults.sh apply

# 13. Local models
# 13.1. Deploy the llama.cpp package based on llama/README.md
llm start
# 13.2. On first use in Pi, run /login llama.cpp
# 13.3. Use /llama to download or load a model, then select it with /model

# 14. Enable optional integrations
# 14.1. Install Pi's generated Herdr integration when using Herdr workspaces:
herdr integration install pi
herdr integration status
# 14.2. Activate the Stow-deployed Herdr default-tabs plugin:
herdr plugin link ~/.config/herdr/local-plugins/default-tabs
herdr plugin list --plugin hrmnjt.default-tabs
# 14.3. Brave configuration
# - Brave extensions: Bitwarden, Readwise Highlighter, and Dark Reader.
# - Install the Gruvbox Slate Brave theme.
# 14.4. Bitwarden desktop
# - Sign in, then enable Settings → Security → Unlock with Touch ID.
# - Optionally enable Ask for Touch ID on app start.
# - Keep the Brave extension; use Apple Passwords when a master password is needed.
```

#### Setup references

- [Changelog](CHANGELOG.md)
- [Gruvbox Dark Hard palette and application map](GRUVBOX.md)
- [AeroSpace](aerospace/README.md)
- [Claude Code](claude/README.md)
- [Ghostty](ghostty/README.md)
- [Glow](glow/README.md)
- [Gh](gh/README.md)
- [Git](git/README.md)
- [Herdr](herdr/README.md)
- [Ivanti VPN](ivanti/README.md)
- [Lazygit](lazygit/README.md)
- [Local llama.cpp inference](llama/README.md)
- [Neovim](nvim/README.md)
- [Pi agent package](pi/README.md)
- [Starship](starship/README.md)
- [Wallpapers](wallpapers/README.md)
- [Zed](zed/README.md)
- [Zsh](zsh/README.md)

### frequently performed operations

#### Checking repository and host health

Run the portable, non-mutating repository checks while editing:

```bash
just doctor --only-check
```

This validates shell syntax, strict JSON, TOML, Git and Just configuration,
whitespace, conflict markers, and fail-closed Git identity selection in isolated
temporary repositories, plus the Claude Code uv guard and Git identity settings.
Tools unavailable in the development sandbox are reported as
warnings rather than hiding the checks that did run.

Run the complete diagnostic on the host Mac:

```bash
just doctor
```

The full mode runs the same repository checks, then inspects Brew packages,
expected commands, Stow links, the deployed Git identity, Pi dependencies and
settings, native Seatbelt prerequisites, AeroSpace, Herdr, and GitHub CLI
authentication.
It reports remediation commands but never installs, rewrites, reloads, or
repairs the setup. Add `--verbose` (or `-v`) to either mode to show the commands
and captured output behind integration checks:

```bash
just doctor --verbose
just doctor --only-check --verbose
```

When changing the Stow diagnostic, run its small shell regression check:

```bash
./_scripts/tests/doctor-stow.sh
```

It tests six disposable healthy/broken link layouts without Node, Homebrew, or
changes to your real home directory. Normal doctor runs do not run these fixtures.
GitHub Actions runs `just doctor --only-check` and this regression check on pull
requests and on `main`.

#### Managing macOS defaults

Preview the tracked behavioral defaults before changing the host:

```bash
./_scripts/macos-defaults.sh preview
```

`apply` creates a timestamped backup of every managed key that would change,
then writes only those changes. Backups live under
`~/.local/state/hrmnjt-dev/macos-defaults/` and record whether each key existed,
so restoration can either write its previous typed value or remove an override
that was previously absent.

```bash
./_scripts/macos-defaults.sh apply
./_scripts/macos-defaults.sh backups
./_scripts/macos-defaults.sh restore latest
./_scripts/macos-defaults.sh restore <backup-directory>
```

A restore first captures the current state as another backup. The script does
not restart Dock or Finder, move existing screenshots, or apply settings
silently; log out and back in after applying or restoring when necessary.

#### Managing packages

Use Homebrew's native commands directly; the Justfile deliberately avoids thin
wrappers around standard CLI operations:

```bash
brew install <package>       # then add it to Brewfile with a descriptive comment
brew bundle check            # verify every tracked package is installed
brew bundle cleanup          # preview installed packages absent from Brewfile
brew bundle cleanup --force  # remove them only after reviewing the preview
```

#### Local models

Bootstrap the llama.cpp router when local inference is needed. It starts
without loading a model:

```bash
llm start
llm status
```

Then, inside Pi:

1. Run `/login llama.cpp` once and accept the local default URL.
2. Run `/llama` to download, load, or unload models.
3. After loading a model, run `/model` and select its actual llama.cpp model ID.

`_models/` is the single Git-ignored llama.cpp cache. Download and manage every
model through `/llama`; do not maintain a separate manual GGUF layout. See the
[llama.cpp guide](llama/README.md) for router deployment, Hugging Face
authentication, service checks, and model storage.

#### Add a top-level package or repository-local directory

Top-level names determine whether `just stowall` deploys a directory:

| Form | Meaning |
|---|---|
| `<name>/` | Stow package whose contents are symlinked into `$HOME` |
| `_<name>/` | Repository-local data or helpers that must not be Stowed |

The `[!_]*/` glob in `Justfile` enforces this convention. For example,
`llama/` is deployed, while `_scripts/` and `_models/` remain in the repository.
Prefix new repository-local top-level directories with `_`.

## Changelog

Workflow changes worth remembering are recorded in [CHANGELOG.md](CHANGELOG.md).

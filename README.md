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

# 7. Install everything tracked in Brewfile
just brewinst

# 8. Deploy the dotfiles
just stowall

# 9. Install and configure Pi
# 9.1. Pi - https://pi.dev/docs/latest/quickstart#install
# 9.2. Install dependencies for pi
just pi-deps
# 9.3. Initialize Pi's intentional settings
if [[ ! -f ~/.pi/agent/settings.json ]]; then
  cp ~/.pi/agent/settings.template.json ~/.pi/agent/settings.json
fi
# 9.4. Build the Pi sandbox
just gondolin-image
# Restart the login shell, then continue with step 10
exec zsh -l

# 10. Configure Git and GitHub SSH
just gitsetup
just ghsshkey
# Add the copied public key at https://github.com/settings/keys
ssh -T git@github.com
# After SSH authentication succeeds, update this checkout:
git remote set-url origin git@github.com:hrmnjt/dev.git

# 11. Complete required app permissions
# 11.1. Grant AeroSpace Accessibility permission; see the aerospace/README.md
# 11.2. Grant Ghostty or the active terminal Accessibility and Automation
# permissions when using the Ivanti VPN commands; see the ivanti/README.md
# 11.3. Sign in to required browser, email, messaging, and work applications

# 12. Gruvbox macOS appearance
just macos-gruvbox

# 13. Local models
# 13.1. Download and configure local models based on llama/README.md
# 13.2. Select and verify models
llm switch
llm check
# 13.3. On the first use in Pi, open /model and select llama.cpp / local-model

# 14. Enable optional integrations
# 14.1. Install Pi's generated Herdr integration when using Herdr workspaces:
herdr integration install pi
herdr integration status
# 14.2. Brave configuration
# - Brave extensions: Bitwarden, Readwise Highlighter, and Dark Reader.
# - Install the Gruvbox Slate Brave theme.
```

#### Setup references

- [AeroSpace](aerospace/README.md)
- [Ghostty](ghostty/README.md)
- [Git](git/README.md)
- [Herdr](herdr/README.md)
- [Ivanti VPN](ivanti/README.md)
- [Local llama.cpp inference](llama/README.md)
- [Neovim](nvim/README.md)
- [Pi agent package](pi/README.md)
- [Starship](starship/README.md)
- [Wallpapers](wallpapers/README.md)
- [Zed](zed/README.md)
- [Zsh](zsh/README.md)

### frequently performed operations

#### Managing packages

Install the package, add it to `Brewfile` with a descriptive comment, and verify
that the bundle is complete:

```bash
brew install <package>
# Edit Brewfile
just brewcheck
```

Inspect packages installed locally but missing from `Brewfile` with:

```bash
just brewdiff
```

Remove untracked packages only after reviewing that output:

```bash
just brewclean
```

#### Local models

Download or try another local model

1. Follow the [llama.cpp guide](llama/README.md) and download the GGUF under
   `_models/<model-name>/`.
2. Verify the publisher's checksum when one is available.
3. Select and test it:

```bash
llm switch
llm check
```

`llm switch` updates the host-local configuration and starts or restarts the
service. Switching GGUFs does not require changing Pi's stable model ID.

#### Add a top-level package or repository-local directory

Top-level names determine whether `just stowall` deploys a directory:

| Form | Meaning |
|---|---|
| `<name>/` | Stow package whose contents are symlinked into `$HOME` |
| `_<name>/` | Repository-local data or helpers that must not be Stowed |

The `[!_]*/` glob in `Justfile` enforces this convention. For example,
`llama/` is deployed, while `_scripts/` and `_models/` remain in the repository.
Prefix new repository-local top-level directories with `_`.

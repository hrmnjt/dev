# sudo make me a sandwich!

## What is in the repo?
- Ingredients...
- ...prepared the way I like it...
- ...so that, I handcraft my sandwich...
- ...quickly, even in a new kitchen

It also reminds me how I like my sandwich, coz sometimes I forget.

BTW, Borrowed reference from [XKCD 149](https://xkcd.com/149/), BTW.

## What is this not?
- stuff that might not suit your workflow!
- might not work for anything other than macosx as of now.

## for future Harman

When you get a new macosx:

```bash
# Step 1: Set the Mac hostname (replace with your preferred name)
sudo scutil --set ComputerName "Harman's MacBook"
sudo scutil --set LocalHostName "harmans-macbook"
sudo scutil --set HostName "harmans-macbook"

# Step 2: [Install Homebrew](https://brew.sh/)

# Step 3: Install just and stow: 
brew install just stow

# Step 4: Clone this repo:
mkdir -p ~/code/github.com/hrmnjt
git clone https://github.com/hrmnjt/dev.git ~/code/github.com/hrmnjt/dev
cd dev

# Step 5: Setup XDG and zsh config
just xdgsetup

# Step 6: Restart terminal to load zsh config, then install all packages
just brewinst

# Step 7: Install pi separately (not in Brewfile)
# Use the current curl installer from: https://pi.dev/docs/latest/quickstart#install

# Step 8: .dotfiles in place with stow
just stowall

# Step 9: Install pi extension dependencies
just pi-deps

# Step 9.5: Apply gruvbox-inspired macOS appearance and wallpaper
just macos-gruvbox

# Step 10: Build the custom Gondolin VM image for pi tools
just gondolin-image

# Step 11: Generate SSH key for GitHub
just ghsshkey
# Add the copied public key to GitHub, then test SSH auth:
ssh -T git@github.com
# Step 12: Switch this repo from HTTPS to SSH once GitHub SSH is working
git remote set-url origin git@github.com:hrmnjt/dev.git

# Step 13: Create git directory structure
just gitsetup
```

### Top-level directory nomenclature

Top-level directory names indicate whether GNU Stow deploys them:

| Form | Meaning |
|---|---|
| `<name>/` | Stow package whose contents are symlinked into `$HOME` |
| `_<name>/` | Repository-local data or helper files that must not be Stowed |

The `[!_]*/` glob in `Justfile` enforces this convention. For example,
`llama/` is deployed, while `_scripts/` and `_models/` remain inside the repo.
When adding a repo-local top-level directory, prefix it with `_`.


### Local LLM inference

The inference stack uses Homebrew `llama.cpp`, a tracked `launchd` service, and
GGUF weights stored under the repo's ignored `_models/` directory. The active
model is host-local state rather than tracked dotfiles configuration. By
default, the server binds only to `127.0.0.1:8080` and exposes the stable
`local-model` alias through an OpenAI-compatible API to pi.

After downloading a GGUF into `_models/`, install, deploy, configure, and start
the service on the host Mac:

```bash
just brewinst       # or: brew install llama.cpp
just stowall
loadshell
llm switch          # fzf-select a GGUF, save it, and start the service
just llm-check
```

Then run `/reload` in pi, open `/model`, and choose:

```text
llama.cpp / local-model
```

Service commands:

```bash
llm start
llm stop
llm restart
llm switch
llm status
llm logs
llm --help
```

The LaunchAgent plist is deployed to
`$XDG_CONFIG_HOME/llama/` (default: `~/.config/llama/`) and loaded on demand
rather than automatically at login. `llm stop` unloads it completely. See
`_models/README.md` for the model-directory convention, host-local settings,
and model-switching workflow.

## ClickOps configuration

- Settings: iCloud sign in
- Settings: General > Software Update
- Settings: Desktop & Dock
    - Reduce dock icon size
    - Position on screen: Right
    - Minimize windows to application icon: On
    - Automatically hide and show dock: On
    - Animate opening windows: Off
    - Show suggested and recent apps in Dock: Off
    - Default web browser: Brave Browser
- Brave
  - Install extensions: Bitwarden, Readwise Highlighter, Dark Reader
  - Install themes: Gruvbox Slate
  - Go through settings and change the details where applicable
- AeroSpace: grant Accessibility permission on first launch; see `aerospace/README.md`

# ## Project Overview
# This is a **dotfiles repository** for managing a personal development environment on macOS.
# Uses **GNU stow** to symlink configuration files from logical directories into home directory.
#
# ## Architecture & Structure
#
# **Configuration directories** (used by stow to symlink to home):
# - `ghostty/` — Terminal emulator config
# - `nvim/` — Neovim configuration (Kickstart-based)
# - `zsh/` — Zsh shell config (.zshrc, .zprofile, .zshenv)
# - `zed/` — Zed editor settings
# - `starship/` — Starship prompt configuration
# - `wezterm/` — WezTerm terminal config
#
# **Package management:**
# - `Brewfile` — Homebrew packages and casks to install
#
# Each config directory mirrors the home directory structure
# (e.g., `nvim/.config/nvim/init.lua` → `~/.config/nvim/init.lua` when deployed via stow).
#
# ## Package Management Workflow
#
# 1. Install new packages manually: `brew install <package>`
# 2. Add package to `Brewfile` with descriptive comment on the line above
# 3. Commit changes to git
# 4. On new machines, run `just brewinst` to install all packages
#
# ## Important Notes
#
# - Requires Homebrew packages: neovim, starship, eza, ghostty, zed, and others in Brewfile
# - SSH keys stored in `~/.ssh/` (not in version control)
# - XDG_CONFIG_HOME must be set to `~/.config` in shell environment
# - All sensitive data (passwords, API keys) go to Bitwarden, not config files

# Deploy all dotfiles to home directory
stowall:
    stow -t ~ */

# Remove all dotfiles symlinks from home directory
unstowall:
    stow -t ~ -D */

# Check if all Brewfile packages are installed
brewcheck:
    brew bundle check

# Install all packages from Brewfile
brewinst:
    brew bundle install

# List installed packages not in Brewfile
brewdiff:
    brew bundle cleanup

# Remove installed packages not in Brewfile
brewclean:
    brew bundle cleanup --force

# Create git folder structure for repo organization
gitsetup:
    mkdir -p ~/code/github.com/hrmnjt
    mkdir -p ~/code/work/doh

# Setup .config directory and deploy zsh config (run first on new machines)
xdgsetup:
    mkdir -p ~/.config
    stow -t ~ zsh

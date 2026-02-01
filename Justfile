# Dotfiles management with GNU stow. See README.md for full documentation.

# --- Stow commands ---

# Deploy all config directories to ~ via symlinks (ghostty, nvim, zsh, zed, starship, wezterm)
stowall:
    stow -t ~ */

# Remove all symlinks created by stowall (safe: only removes symlinks, not actual files)
unstowall:
    stow -t ~ -D */

# --- Homebrew commands ---
# 1. Install new packages manually: `brew install <package>`
# 2. Add package to `Brewfile` with descriptive comment on the line above
# 3. Commit changes to git
# 4. On new machines, run `just brewinst` to install all packages

# Verify all Brewfile packages are installed (useful before commits or after pulling)
brewcheck:
    brew bundle check

# Install all packages defined in Brewfile (idempotent: skips already installed)
brewinst:
    brew bundle install

# Show packages installed locally but missing from Brewfile (candidates to add or remove)
brewdiff:
    brew bundle cleanup

# Uninstall packages not in Brewfile (run brewdiff first to preview what gets removed)
brewclean:
    brew bundle cleanup --force

# --- Setup commands (new machine) ---

# Create directory structure for git repos (github personal + work)
gitsetup:
    mkdir -p ~/code/github.com/hrmnjt
    mkdir -p ~/code/work/doh

# Bootstrap: create ~/.config and deploy zsh (run first - sets XDG_CONFIG_HOME for other configs)
xdgsetup:
    mkdir -p ~/.config
    stow -t ~ zsh

# Generate ed25519 SSH key for GitHub, add to ssh-agent, copy pubkey to clipboard
ghsshkey:
    ./_scripts/sshsetup.sh

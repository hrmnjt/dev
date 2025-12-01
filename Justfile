# Stow dotfiles management

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


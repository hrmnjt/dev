# Stow dotfiles management

# Deploy all dotfiles to home directory
stowall:
    cd stow && stow -t ~ */

# Remove all dotfiles symlinks from home directory
unstowall:
    cd stow && stow -t ~ -D */

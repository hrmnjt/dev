# AGENTS.md

## Project Overview
This is a **dotfiles repository** for managing a personal development environment on macOS. Uses **GNU stow** to symlink configuration files from logical directories into home directory.

## Architecture & Structure
```
stow/
  ├── ghostty/        # Terminal emulator config
  ├── nvim/           # Neovim configuration (Kickstart-based)
  ├── zsh/            # Zsh shell config (.zshrc, .zprofile, .zshenv)
  ├── zed/            # Zed editor settings
  ├── starship/       # Starship prompt configuration
  └── wezterm/        # WezTerm terminal config
```

Each subdirectory mirrors `~` structure: configs go in subdirs like `.config/app-name/` before stow deployment.

## Key Commands

**Deploy dotfiles:**
```bash
cd stow
stow -t ~ */          # symlink all configs to ~
stow -t ~ zsh nvim    # symlink specific apps
```

**Remove symlinks:**
```bash
stow -t ~ -D */       # unlink all
```

**Preview changes:**
```bash
stow -t ~ -n */       # dry-run (no changes)
```

Alternatively, create a shell alias for convenience:
```bash
alias stow='stow -t ~'
# Then use: stow */ or stow zsh nvim
```

## Code Style & Conventions

- **Lua** (Neovim): Stylua formatter configured in `.stylua.toml`
- **Shell scripts**: POSIX-compliant where possible
- **Config files**: Plain text configs (TOML, JSON, Lua)
- **Comments**: Use language-native comment syntax

## Important Notes

- Requires Homebrew packages: neovim, starship, eza, ghostty, zed
- SSH keys stored in `~/.ssh/` (not in version control)
- XDG_CONFIG_HOME must be set to `~/.config` in shell environment
- All sensitive data (passwords, API keys) go to Bitwarden, not config files

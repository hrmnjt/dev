# AGENTS.md

## Project Overview
This is a **dotfiles repository** for managing a personal development environment on macOS. Uses **GNU stow** to symlink configuration files from logical directories into home directory.

## Architecture & Structure

**Configuration directories** (used by stow to symlink to home):
- `ghostty/` — Terminal emulator config
- `nvim/` — Neovim configuration (Kickstart-based)
- `zsh/` — Zsh shell config (.zshrc, .zprofile, .zshenv)
- `zed/` — Zed editor settings
- `starship/` — Starship prompt configuration
- `wezterm/` — WezTerm terminal config

**Package management:**
- `Brewfile` — Homebrew packages and casks to install

Each config directory mirrors the home directory structure (e.g., `nvim/.config/nvim/init.lua` → `~/.config/nvim/init.lua` when deployed via stow).

## Key Commands

**Using Justfile (recommended):**
```bash
just stowall       # Deploy all dotfiles
just unstowall     # Remove all dotfiles
just brewcheck     # Check Brewfile packages
just brewinst      # Install all packages from Brewfile
```

**Manual stow commands:**
```bash
cd stow && stow -t ~ */        # Deploy all
cd stow && stow -t ~ -D */     # Remove all
cd stow && stow -t ~ -n */     # Preview changes (dry-run)
```

## Code Style & Conventions

- **Lua** (Neovim): Stylua formatter configured in `.stylua.toml`
- **Shell scripts**: POSIX-compliant where possible
- **Config files**: Plain text configs (TOML, JSON, Lua)
- **Comments**: Use language-native comment syntax

## Package Management

**Brewfile:** Root-level `Brewfile` tracks all Homebrew packages and casks. Each package is documented with a comment on the line before it.

**Workflow:**
1. Install new packages manually: `brew install <package>`
2. Add package to `Brewfile` with descriptive comment on the line above
3. Commit changes to git
4. On new machines, run `just brewinst` to install all packages

**Commands:**
- `just brewcheck` — validate all packages in Brewfile are installed
- `just brewinst` — install all packages from Brewfile

## Important Notes

- Requires Homebrew packages: neovim, starship, eza, ghostty, zed, and others in Brewfile
- SSH keys stored in `~/.ssh/` (not in version control)
- XDG_CONFIG_HOME must be set to `~/.config` in shell environment
- All sensitive data (passwords, API keys) go to Bitwarden, not config files

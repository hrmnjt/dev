# Dotfiles management with GNU stow. See README.md for full documentation.

# --- Diagnostics ---

# Validate tracked configuration, then inspect the host installation unless
# --only-check is passed. Use --verbose for command output and diagnostics. This
# command never repairs or changes the setup.
[arg("only_check", long="only-check", value="true")]
[arg("verbose", long="verbose", short="v", value="true")]
@doctor only_check="false" verbose="false":
    DOCTOR_ONLY_CHECK="{{only_check}}" DOCTOR_VERBOSE="{{verbose}}" /bin/sh ./_scripts/doctor.sh

# --- Stow commands ---

# Top-level directory nomenclature:
#   <name>/  = Stow package deployed into $HOME
#   _<name>/ = repo-local data or helpers that must not be Stowed
# The [!_]*/ glob enforces this convention. --no-folding keeps writable targets real.
stowall:
    stow --no-folding -t ~ [!_]*/

# Remove all symlinks created by stowall (safe: only removes symlinks, not actual files)
unstowall:
    stow --no-folding -t ~ -D [!_]*/

# --- Theme ---

# Switching records the choice for Zsh and Neovim, links Ghostty's overlay, and
# on macOS sets dark mode, the accent colour, the wallpaper and AeroSpace borders.
# Run on the host Mac after `just stowall`. See NORD.md.
# Print the selected theme, or switch to gruvbox (the default) or nord.
theme name="":
    @/bin/sh ./_scripts/theme.sh {{quote(name)}}

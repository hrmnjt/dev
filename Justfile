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

# --- Setup commands (new machine) ---

# Generate ed25519 SSH key for GitHub, add to ssh-agent, copy pubkey to clipboard.
# Keep this recipe because the script encodes key naming, SSH config, Keychain,
# and clipboard behavior rather than aliasing one standard command.
ghsshkey:
    ./_scripts/sshsetup.sh


# --- macOS appearance ---

# Apply gruvbox-inspired macOS appearance settings and wallpaper.
# Run on the host Mac after `just stowall`. Some UI colors may require logging out/in.
macos-gruvbox:
    osascript -e 'tell application "System Events" to tell appearance preferences to set dark mode to true'
    defaults write -g AppleAccentColor -int 1
    just wallpaper

# Set the tracked gruvbox wallpaper for every desktop/space.
# The image is deployed by stow to ~/.local/share/wallpapers/.
wallpaper:
    wallpaper="${HOME}/.local/share/wallpapers/pink-floyd-gruvbox-dark.jpg"; osascript -e "tell application \"System Events\" to tell every desktop to set picture to POSIX file \"$wallpaper\""

# --- Gondolin VM image ---

# Build a custom VM image with git, ripgrep, jq, fd, and other dev tools.
# Config: pi/.pi/agent/gondolin-image.json
# Output: ~/.gondolin/custom-image (used by GONDOLIN_GUEST_DIR env var)
# Requires: lz4, e2fsprogs (see Brewfile)
gondolin-image:
    npx @earendil-works/gondolin build \
        --config pi/.pi/agent/gondolin-image.json \
        --output ~/.gondolin/custom-image

# Dotfiles management with GNU stow. See README.md for full documentation.

# --- Stow commands ---

# Deploy config directories to ~ via symlinks (aerospace, ghostty, llama, nvim, pi, etc.).
# Top-level directories beginning with "_" contain repo-local data or scripts and are
# deliberately not Stow packages. --no-folding keeps writable target directories real.
stowall:
    stow --no-folding -t ~ [!_]*/

# Remove all symlinks created by stowall (safe: only removes symlinks, not actual files)
unstowall:
    stow --no-folding -t ~ -D [!_]*/

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

# Install pi extension dependencies (run after stowall)
pi-deps:
    npm install --prefix ~/.pi/agent

# --- Local LLM inference ---

# Download the pinned Qwen3.5 9B Q4_K_M GGUF (~5.3 GiB). The partial download is
# resumable; the final file is checked against the publisher's Git LFS SHA-256.
llm-download:
    #!/bin/sh
    set -eu
    dir="{{justfile_directory()}}/_models/qwen3.5-9b"
    file="$dir/Qwen3.5-9B-Q4_K_M.gguf"
    partial="$file.part"
    mkdir -p "$dir"
    if [ ! -f "$file" ]; then
        curl --fail --location --retry 3 --continue-at - --output "$partial" \
            "https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/3885219b6810b007914f3a7950a8d1b469d598a5/Qwen3.5-9B-Q4_K_M.gguf"
        mv "$partial" "$file"
    fi
    printf '%s  %s\n' \
        '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8' \
        "$file" | shasum -a 256 --check

# Check the local server health and list the model exposed through its OpenAI API.
llm-check:
    curl --fail --silent --show-error http://127.0.0.1:8080/health
    @printf '\n'
    curl --fail --silent --show-error http://127.0.0.1:8080/v1/models
    @printf '\n'

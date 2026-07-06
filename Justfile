# Dotfiles management with GNU stow. See README.md for full documentation.

# --- Stow commands ---

# Deploy all config directories to ~ via symlinks (aerospace, ghostty, nvim, zsh, zed, starship, pi, etc.)
# --no-folding keeps target directories like ~/.pi real, so pi/npm runtime files
# are created on the host instead of inside this repo via a folded directory symlink.
stowall:
    stow --no-folding -t ~ */

# Remove all symlinks created by stowall (safe: only removes symlinks, not actual files)
unstowall:
    stow --no-folding -t ~ -D */

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

# --- Local LLM for pi ---

# Download the recommended local coding model GGUF outside this repo.
# Requires: uv. Downloads to ~/Models/llm/qwen2.5-coder-32b-instruct-q4_k_m
local-llm-download-qwen32b:
    mkdir -p "$HOME/Models/llm/qwen2.5-coder-32b-instruct-q4_k_m"
    uvx --from huggingface_hub huggingface-cli download \
        bartowski/Qwen2.5-Coder-32B-Instruct-GGUF \
        --include "*Q4_K_M.gguf" \
        --local-dir "$HOME/Models/llm/qwen2.5-coder-32b-instruct-q4_k_m"

# Run llama.cpp's OpenAI-compatible server for pi on localhost:8080.
# Stop with Ctrl-C. Run this in a host terminal before selecting the local model in pi.
local-llm-serve-qwen32b:
    #!/usr/bin/env bash
    set -euo pipefail
    model_dir="$HOME/Models/llm/qwen2.5-coder-32b-instruct-q4_k_m"
    if [ ! -d "$model_dir" ]; then
        echo "Model directory not found: $model_dir. Run: just local-llm-download-qwen32b" >&2
        exit 1
    fi
    model="$(find "$model_dir" -name '*Q4_K_M.gguf' -type f -print | head -n 1)"
    if [ -z "$model" ]; then
        echo "Model file not found in $model_dir. Run: just local-llm-download-qwen32b" >&2
        exit 1
    fi
    exec llama-server \
        --model "$model" \
        --alias qwen2.5-coder-32b-local \
        --host 127.0.0.1 \
        --port 8080 \
        --ctx-size 65536 \
        --n-gpu-layers 999 \
        --parallel 1

# Verify the local llama.cpp server is responding.
local-llm-smoke:
    curl -s http://127.0.0.1:8080/v1/models | jq .

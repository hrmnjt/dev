# sudo make me a sandwich!

## What is in this repo?

- Ingredients...
- ...prepared the way I like it...
- ...so that, I handcraft my sandwich...
- ...quickly, even in a new kitchen

It also reminds me how I like my sandwich, coz sometimes I forget.

Borrowed from [XKCD 149](https://xkcd.com/149/), BTW.

## What is this not?

- stuff that might not suit your workflow!
- might not work for anything other than macosx as of now.

## for future Harman

### Complete the macOS first-run tasks

```bash
# 1. Sign in to iCloud.

# 2. Install all available updates from System Settings → General → Software Update.

# 3. Set the Mac hostname, replacing xxx when needed:
sudo scutil --set ComputerName "Ghost XXX"
sudo scutil --set LocalHostName "ghost-xxx"
sudo scutil --set HostName "ghost-xxx"

# 4. Install Homebrew and the bootstrap tools
# Install Homebrew from https://brew.sh/

# Make it available in the current shell
eval "$(/opt/homebrew/bin/brew shellenv)"

# 5. Install tools to bootstrap the repo
brew install just stow

# 6. Clone the repository
mkdir -p ~/code/github.com/hrmnjt
git clone https://github.com/hrmnjt/dev.git ~/code/github.com/hrmnjt/dev
cd ~/code/github.com/hrmnjt/dev

# Create the repository-local, Git-ignored model cache
mkdir -p _models

# 7. Install everything tracked in Brewfile
just brewinst

# 8. Deploy the dotfiles
just stowall

# 9. Install and configure Pi
# 9.1. Pi - https://pi.dev/docs/latest/quickstart#install
# 9.2. Install dependencies for pi
just pi-deps
# 9.3. Initialize Pi's intentional settings
if [[ ! -f ~/.pi/agent/settings.json ]]; then
  cp ~/.pi/agent/settings.template.json ~/.pi/agent/settings.json
fi
# 9.4. Build the Pi sandbox
just gondolin-image
# Restart the login shell, then continue with step 10
exec zsh -l

# 10. Configure Git and GitHub SSH
just gitsetup
just ghsshkey
# Add the copied public key at https://github.com/settings/keys
ssh -T git@github.com
# After SSH authentication succeeds, update this checkout:
git remote set-url origin git@github.com:hrmnjt/dev.git

# 10.1. Authenticate the GitHub CLI over SSH; see gh/README.md
gh auth login

# 11. Complete required app permissions
# 11.1. Grant AeroSpace Accessibility permission; see the aerospace/README.md
# 11.2. Grant Ghostty or the active terminal Accessibility and Automation
# permissions when using the Ivanti VPN commands; see the ivanti/README.md
# 11.3. Sign in to required browser, email, messaging, and work applications

# 12. Gruvbox macOS appearance
just macos-gruvbox

# 13. Local models
# 13.1. Deploy the llama.cpp package based on llama/README.md
llm start
# 13.2. On first use in Pi, run /login llama.cpp
# 13.3. Use /llama to download or load a model, then select it with /model

# 14. Enable optional integrations
# 14.1. Install Pi's generated Herdr integration when using Herdr workspaces:
herdr integration install pi
herdr integration status
# 14.2. Activate the Stow-deployed Herdr default-tabs plugin:
herdr plugin link ~/.config/herdr/local-plugins/default-tabs
herdr plugin list --plugin hrmnjt.default-tabs
# 14.3. Brave configuration
# - Brave extensions: Bitwarden, Readwise Highlighter, and Dark Reader.
# - Install the Gruvbox Slate Brave theme.
# 14.4. Bitwarden desktop
# - Sign in, then enable Settings → Security → Unlock with Touch ID.
# - Optionally enable Ask for Touch ID on app start.
# - Keep the Brave extension; use Apple Passwords when a master password is needed.
```

#### Setup references

- [AeroSpace](aerospace/README.md)
- [Ghostty](ghostty/README.md)
- [Gh](gh/README.md)
- [Git](git/README.md)
- [Herdr](herdr/README.md)
- [Ivanti VPN](ivanti/README.md)
- [Lazygit](lazygit/README.md)
- [Local llama.cpp inference](llama/README.md)
- [Neovim](nvim/README.md)
- [Pi agent package](pi/README.md)
- [Starship](starship/README.md)
- [Wallpapers](wallpapers/README.md)
- [Zed](zed/README.md)
- [Zsh](zsh/README.md)

### frequently performed operations

#### Managing packages

Install the package, add it to `Brewfile` with a descriptive comment, and verify
that the bundle is complete:

```bash
brew install <package>
# Edit Brewfile
just brewcheck
```

Inspect packages installed locally but missing from `Brewfile` with:

```bash
just brewdiff
```

Remove untracked packages only after reviewing that output:

```bash
just brewclean
```

#### Local models

Bootstrap the llama.cpp router when local inference is needed. It starts
without loading a model:

```bash
llm start
llm status
```

Then, inside Pi:

1. Run `/login llama.cpp` once and accept the local default URL.
2. Run `/llama` to download, load, or unload models.
3. After loading a model, run `/model` and select its actual llama.cpp model ID.

`_models/` is the single Git-ignored llama.cpp cache. Download and manage every
model through `/llama`; do not maintain a separate manual GGUF layout. See the
[llama.cpp guide](llama/README.md) for router deployment, Hugging Face
authentication, service checks, and model storage.

#### Add a top-level package or repository-local directory

Top-level names determine whether `just stowall` deploys a directory:

| Form | Meaning |
|---|---|
| `<name>/` | Stow package whose contents are symlinked into `$HOME` |
| `_<name>/` | Repository-local data or helpers that must not be Stowed |

The `[!_]*/` glob in `Justfile` enforces this convention. For example,
`llama/` is deployed, while `_scripts/` and `_models/` remain in the repository.
Prefix new repository-local top-level directories with `_`.

## Changelog

Workflow changes worth remembering, newest first. Everything up to and
including [1.0.0] stays as one block at the bottom; changes after it are
expanded month by month. Full history lives in `git log`.

### 202609

- 20260921: Added persistent deduplicated Zsh history, privacy controls, native
  completions, fzf shell search, autosuggestions, and syntax highlighting;
  expanded and pruned the setup backlog, including deferred shell-performance
  work.
- 20260918: Added the Bitwarden desktop app and Touch ID setup notes; floated
  Bitwarden and Apple Passwords in AeroSpace.
- 20260918: Removed duplicate Homebrew shell initialization and cleared stale
  shell and Herdr cleanup items from the backlog.
- 20260916: Split the Outlook and Teams PWAs across AeroSpace workspaces four
  and five.
- 20260915: Dropped the nvim tab from the Herdr default-tabs plugin.
- 20260914: Made the Pi review summary copy-friendly.
- 20260910: Integrated the herdr-nvim sidebar and annotations.
- 20260909: Added prev/next workspace-to-monitor AeroSpace bindings, and made
  Git require fast-forward pulls.
- 20260909: Enabled Herdr desktop agent notifications.
- 20260908: Set `JAVA_HOME` for local Spark via `openjdk@17`.
- 20260907: Added a Neovim-first review flow in Pi.
- 20260902: Added the GitHub CLI package, exported `GH_TOKEN` for Gondolin,
  and limited Pi's built-in tools to a minimal set.

### 202608

- 20260831: Switched to the native menu bar and removed custom status bars;
  added the `aerostatus` menu-bar workspace indicator and Handy.
- 20260830: Completed the Gruvbox SketchyBar status bar with scripting, then
  replaced it; added focused-window AeroSpace borders and Kitty graphics
  rendering in Herdr.
- 20260829: Documented the macOS setup backlog.
- 20260826: Added Postman to the Brewfile.
- 20260817: Added hledger journal support in Neovim.
- 20260814: Routed Safari and floated Windows App in AeroSpace; moved
  Obsidian to workspace two.
- 20260811: Opened Neovim worktree tabs in Herdr; added Lazygit and plain
  Markdown defaults in Neovim.
- 20260810: Replaced desktop apps with the Codex CLI; added a Ghostty cursor
  warp animation.
- 20260809: Reset Neovim to a minimal LazyVim config and made Neovim the
  default editor.
- 20260808: Added the Herdr default worktree tabs plugin and the tldraw cask.
- 20260807: Pruned stale Git refs on fetch; hid Herdr scrollbars and moved
  tabs to the bottom.
- 20260806: Enabled the Pi fullscreen TUI by default.
- 20260803: Excluded the model cache from Gondolin; increased Ghostty
  background opacity.
- 20260802: Added `caffeinate` while the Pi agent is working; removed the
  usage extension.

### 202607

- 20260731: Attached clipboard images before Gondolin in Pi.
- 20260730: Migrated the AeroSpace configuration to version 2.
- 20260729: Moved local model management to the Pi router — single model
  store, router service command, and a monitoring guide.
- 20260721/22: Built the Herdr worktree workflow (shortcuts, tab-name
  prompts, notifications) and did a large pass reorganizing repository docs
  and standardizing Stow guidance.
- 20260711/13/25: Added local llama.cpp inference with a model-agnostic
  switcher and launchd logging; dropped the unused Glow markdown renderer.
- 20260708: Switched Starship to a pure-inspired prompt.
- 20260707: Improved the Pi review UI; fixed nerd font rendering in Zed.
- 20260706: Added the Pi WAL writer extension and documented agent package
  tools.
- 20260702/04: Added a merged-branch cleanup alias; briefly mapped
  command-tab to the previous workspace (reverted).

### 202606

- 20260630: Added the Codex cask and routed it to workspace 10.
- 20260628: Added Hugo to the Gondolin image.
- 20260622: Added a flexible monitor and mail workflow; switched Teams to a
  PWA instead of the standalone app.
- 20260618: Documented the Pi extensions in use.
- 20260615: Added the `dab` bundle helper.
- 20260606/08/13: Added work-app casks (Thunderbird, Copilot, Teams,
  WhatsApp, Gimp) and extended Gruvbox theming to fzf, Glow, Zed, and
  wallpapers.
- 20260606: Rebuilt the new-Mac setup docs, SSH remote setup, and
  Pi/Gondolin setup steps; fixed Stow folding of runtime directories;
  enabled terminal and Neovim transparency.
- 20260604: Allowed host VPN commands from Pi and improved Gondolin VM
  routing.
- 20260602/03/05: Updated AeroSpace workspaces for Ghostty, removed
  fallback placement, floated App Store/WhatsApp/Ivanti, and documented
  Git workflow conventions.

### 202605

The explosion month: Pi and Gondolin became the daily driver.

- 20260531/29/28: Fixed review-summary, added a no-fetch option to `wt`,
  and added an AeroSpace trial config.
- 20260524/25/26: Neovim dashboard-header iterations and snacks explorer;
  tried cmux as an experimental multiplexer; added the Pi terminal review
  extension; reorganized the Brewfile into personal vs. work sections.
- 20260522: Replaced kickstart with LazyVim (python/sql/markdown extras).
- 20260519: Added the Hunk review feedback workflow, universal usage
  tracking, and upgraded Gondolin to 0.12.0.
- 20260515/16: Canonicalized Gruvbox theme variables and switched Starship
  to gruvbox-rainbow; added Pi notify and uv extensions; dot-separated
  worktree paths; preserved Ghostty cwd integration.
- 20260514: Added the zsh Git worktree helper (`wt`).
- 20260509/10: Added the `/review` extension and PR-review skill for ADO
  reviews; tried a custom Pi footer (later removed).
- 20260508/09: Adopted Gruvbox across Pi, Ghostty, Starship, and Zed;
  aligned agent documentation.
- 20260507: Built a custom Gondolin VM image, fixed Git identity inside
  the VM, and enabled outbound SSH proxy for git push/pull.
- 20260506: Tried Zed again with the agent panel.
- 20260505: Tried the Helium browser; fixed out-of-box tools in Gondolin.
- 20260502/05: Added the Pi exit extension, mounted pi/docs in Gondolin,
  introduced the settings template, and made thinking mode print in dim
  colors.
- 20260501: Added the minimal Pi coding agent config with the krun Gondolin
  backend, then iterated through several Pi upgrades.

### 202602-04 (quiet stretch)

- 20260430: Unpinned node@22 and installed the latest Node.
- 20260331: Added the Databricks CLI and gh-cli to the Brewfile.
- 20260318: Brewfile sync — claude-code, a Brave-browser trial, and a fresh
  editor trial.
- 20260307/11: Added ivanti VPN aliases, published a sanitized script, and
  improved command performance with docs.
- 20260220/21: Tried out hledger, duckdb, and Obsidian as an experimental
  Excalidraw.
- 20260203: Added the opencode tap and cask.

### [1.0.0] — 20260202

The baseline setup, written up at
[hrmnjt.dev/2026/02/01/dev](https://hrmnjt.dev/2026/02/01/dev/). One block
covers the whole bootstrap period from the first commit (2025-04) through
the tag: tooling, Brewfile, Neovim, zsh, Ghostty, AeroSpace, and the
initial Pi experiments. See `git log 1.0.0` for the complete history.

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

The Gondolin migration is currently a **candidate**, not host-accepted. Use the
[branch trial and acceptance guide](gondolin/README.md) before merging/deploying;
Stow links in the primary checkout are live source. The steps below describe
the target setup, not host operations already performed.

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
brew bundle install

# 8. Deploy the dotfiles
# For migration, inspect retired links and existing agent files first; see pi/README.md
just stowall

# 9. Install and configure Pi
# 9.1. Install Pi: https://pi.dev/docs/latest/quickstart#install
# Pi's installer owns the pi command; Stow deploys the Gondolin extension.
# 9.2. Reconcile Pi package metadata and remove retired backend dependencies
npm install --prefix ~/.pi/agent
# 9.3. Initialize Pi's intentional settings
if [[ ! -f ~/.pi/agent/settings.json ]]; then
  cp ~/.pi/agent/settings.template.json ~/.pi/agent/settings.json
fi
# 9.4. Shared Gondolin runtime for Pi tools and Claude Code
npm ci --prefix ~/.config/gondolin
# Start a Docker or Podman engine first; Apple's container cannot build this image.
agent-vm build podman  # or: agent-vm build docker
# See gondolin/README.md for acceptance and pi/README.md for safe migration.
# Restart the login shell, then continue with step 10
exec zsh -l

# 10. Configure Git and GitHub SSH
mkdir -p ~/code/work/doh
./_scripts/sshsetup.sh
# Add the copied public key at https://github.com/settings/keys
ssh -T git@github.com
# After SSH authentication succeeds, update this checkout:
git remote set-url origin git@github.com:hrmnjt/dev.git

# 10.1. Authenticate the GitHub CLI over SSH; see gh/README.md
gh auth login

# 10.2. Configure guest credentials through Mac Keychain Access; see gondolin/README.md.
# This setup command runs in a throwaway VM with nothing mounted:
claude setup-token
# Store its token/expiry and a scoped GitHub fine-grained token
# in the documented Keychain entries; never log in inside a work VM.
# Configure/verify main-branch GitHub rulesets yourself, including private-repo support.
agent-vm doctor
# 10.3. Claude cloud execution remains complementary; see claude/README.md.
# The Mac Claude Code CLI keeps its own settings; see claude/README.md#mac-cli.

# 11. Complete required app permissions
# 11.1. Grant AeroSpace Accessibility permission; see the aerospace/README.md
# 11.2. Grant Ghostty or the active terminal Accessibility and Automation
# permissions when using the Ivanti VPN commands; see the ivanti/README.md
# 11.3. Sign in to required browser, email, messaging, and work applications

# 12. Gruvbox macOS appearance
just macos-gruvbox

# 12.1. Review and apply intentional behavioral defaults
./_scripts/macos-defaults.sh preview
./_scripts/macos-defaults.sh apply

# 13. Local models
# 13.1. Deploy the llama.cpp package based on llama/README.md
llm start
# 13.2. On first use in Pi, run /login llama.cpp
# 13.3. Use /llama to download or load a model, then select it with /model

# 14. Enable optional integrations
# 14.1. Pi/Claude status reaches Rex natively; no host command hooks are needed.
# 14.2. Brave configuration
# - Brave extensions: Bitwarden, Readwise Highlighter, and Dark Reader.
# - Install the Gruvbox Slate Brave theme.
# 14.3. Bitwarden desktop
# - Sign in, then enable Settings → Security → Unlock with Touch ID.
# - Optionally enable Ask for Touch ID on app start.
# - Keep the Brave extension; use Apple Passwords when a master password is needed.
```

#### Setup references

- [Gruvbox Dark Hard palette and application map](GRUVBOX.md)
- [AeroSpace](aerospace/README.md)
- [Ghostty](ghostty/README.md)
- [Glow](glow/README.md)
- [Shared Gondolin agent VMs](gondolin/README.md)
- [Claude Code (VM and web sessions)](claude/README.md)
- [Gh](gh/README.md)
- [Git](git/README.md)
- [Ivanti VPN](ivanti/README.md)
- [Lazygit](lazygit/README.md)
- [Local llama.cpp inference](llama/README.md)
- [Neovim](nvim/README.md)
- [Pi agent package](pi/README.md)
- [Podman](podman/README.md)
- [Rex configuration](rex/README.md)
- [Starship](starship/README.md)
- [Wallpapers](wallpapers/README.md)
- [Zed](zed/README.md)
- [Zsh](zsh/README.md)

### frequently performed operations

#### Checking repository and host health

All doctor modes are non-mutating:

```bash
just doctor --only-check  # portable repository checks
just doctor               # also inspect the deployed Mac setup
just doctor --verbose     # include commands and captured integration output
```

Repository checks cover shell syntax, JSON/TOML, Git/Just configuration,
whitespace/conflict markers and fail-closed Git identity. Missing tools produce
warnings. Host checks also inspect packages, Stow links, Pi/Gondolin setup,
Keychain expiry and app integrations; they do not boot a VM, prove isolation or
test a push/PR. Add `--verbose` to either mode for diagnostics.

Run focused script regressions separately; doctor does not run them:

```bash
./_scripts/tests/doctor-stow.sh
./_scripts/tests/doctor-repository.sh
./_scripts/tests/sshsetup.sh
./_scripts/tests/rex-worktrees.sh
```

These use disposable fixtures rather than changing your real home or sessions.
See [VM/Pi tests and host acceptance](gondolin/README.md#checks-and-remaining-acceptance)
for SDK/dependency setup and the opt-in live VM test, and
[Rex checks](rex/README.md#checks) for its server requirement and interactive checks.

#### Managing macOS defaults

Preview the tracked behavioral defaults before changing the host:

```bash
./_scripts/macos-defaults.sh preview
```

`apply` creates a timestamped backup of every managed key that would change,
then writes only those changes. Backups live under
`~/.local/state/hrmnjt-dev/macos-defaults/` and record whether each key existed,
so restoration can either write its previous typed value or remove an override
that was previously absent.

```bash
./_scripts/macos-defaults.sh apply
./_scripts/macos-defaults.sh backups
./_scripts/macos-defaults.sh restore latest
./_scripts/macos-defaults.sh restore <backup-directory>
```

A restore first captures the current state as another backup. The script does
not restart Dock or Finder, move existing screenshots, or apply settings
silently; log out and back in after applying or restoring when necessary.

#### Managing packages

Use Homebrew's native commands directly; the Justfile deliberately avoids thin
wrappers around standard CLI operations:

```bash
brew install <package>       # then add it to Brewfile with a descriptive comment
brew bundle check            # verify every tracked package is installed
brew bundle cleanup          # preview installed packages absent from Brewfile
brew bundle cleanup --force  # remove them only after reviewing the preview
```

#### Local models

Run `llm start` in a host terminal. In Pi, use `/login llama.cpp` once,
`/llama` to download/load/unload models, then `/model` to select a loaded ID.
See the [llama.cpp guide](llama/README.md) for authentication, storage and
service diagnostics.

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

Workflow changes worth remembering, newest first. Older implementation details,
test transcripts and intermediate fixes live in `git log`; entries through
[1.0.0] remain one baseline block.

### 202611

- 20261128: Rex Projects (Cmd+Shift+K) now asks in the command palette:
  choose a listed project or type a checkout path; `[all projects]`, the menu
  session and `fzf` prompts are gone, so no Rex action needs Remote Control.
  `init.lua` sets resume rules: after a Rex server restart, Session Restore
  brings back sessions, tabs and panes, Claude Code and Pi resume only under
  `~/code`, and other agents never do. Pi's rule is set in full because
  preview.25 ships none.
- 20261128: Rex Delete (Cmd+Shift+Backspace) now confirms in the command
  palette with Cancel first, naming the project, branch and path and the
  programs it will stop. Its tab closes before Git runs, and
  `git worktree remove` runs detached so it can't be cut off midway; a refused
  removal says why. Delete no longer needs Remote Control; only Projects still
  uses the `fzf` menu.
- 20261128: Rex New (Cmd+Shift+N) and Open (Cmd+Shift+O) now ask in the
  command palette with no menu session, `fzf` or Remote Control. New asks again
  for invalid or occupied names and offers Open for existing branches. Open
  lists worktrees by newest activity, marked `tab open`, `no tab` or
  `branch only`, with one next step (finish an operation, answer an agent,
  push, commit, close or rebase). It runs its Git reads in parallel and drops
  `[all worktrees]`. Prompt titles stay short because Rex shows them inside
  the text field. Delete and Projects keep the `fzf` menu for now.
- 20261125: Playwright's Chromium in agent VMs now trusts Gondolin's HTTPS
  interception CA, so external HTTPS works without `ignoreHTTPSErrors`. The
  image adds `libnss3-tools`, and each boot imports the CA into the guest
  home's `~/.pki/nssdb`; a failed import stops launch. Rebuild the image
  before launching.
- 20261125: Grew each agent VM's root disk from about 2.4 GiB (455 MiB free)
  to 16 GiB, set by `disk` in Gondolin's `config.json`. The image now installs
  `e2fsprogs` for the boot-time resize, so rebuild it before launching.
- 20261122: Retired Herdr's Brewfile entry, Stow package, Neovim integration
  and doctor checks. Existing Macs still need app/generated-integration cleanup
  and a host edit of the protected Claude hook. Doctor now skips unstaged TOML
  deletions, matching its JSON checks.
- 20261122: Pruned migration diaries, test transcripts, duplicate guidance and
  the sample-model tutorial; kept setup, recovery and pending acceptance checks.
  Corrected the GitHub CLI guide for Gondolin.
- 20261122: Pi's installer now owns `pi`, restoring `pi update`; retired the
  shell/Stow launchers and `agent-vm pi`. Pi discovers Gondolin globally:
  check for `VM <id>` before typing because a missing extension leaves Mac
  tools available. Sessions use Pi's native store.
- 20261122: Kept Pi's uv guard, WAL host tool and enabled-but-blocked MCP.
  Added pinned uv 0.13.9 to the image and isolated guest Python in
  `.venv-vm`; requires an image rebuild. Doctor can use uv's Python for TOML.
  Added pre-migration Pi/Claude session recovery instructions.
- 20261116: Deferred Amp after unresolved image-upload TLS failures and frequent
  forced CLI upgrades; removed it from the image/launcher. Retry notes remain
  in `TODO.md`. Requires an image rebuild.
- 20261116: Added Podman with no default Mac-directory shares.
- 20261109: Fixed live VM bindfs access, sudo modes, guest HTTPS/clock handling
  and Git credentials; added guest Git defaults and Claude onboarding state.
  The live fixture passes; full real-agent acceptance remains pending.
- 20261108: Added bounded, escaped and credential-redacted startup diagnostics.
- 20261107: Corrected Amp bypass configuration and image interface/version checks.
- 20261106: Added the Hex desktop app cask.
- 20261102: Added the candidate shared Gondolin image/policy for Pi tools,
  non-root Claude and initially Amp; retired Pi's Seatbelt backend. Includes
  same-path worktrees, fail-closed identity, read-only agent config/hooks,
  Keychain placeholders, project state, image clipboard and opt-in previews.
  Host acceptance and deployment remain deliberate user steps.
- 20261101: Added the Tailscale desktop app cask.

### 202610

- 20261029: Added Rex's Claude `SessionStart` hook alongside Herdr's host hook.
- 20261028: Routed Claude, ChatGPT and Copilot to workspace 9, Zed to 10.
  Added the Claude desktop app and made Mac Claude auto permission mode default.
- 20261028: Grouped Rex worktrees as tabs in one session per project; deletion
  stops only the target tab and keeps branches and sibling programs.
- 20261026: Rex New tracks an exact fetched remote branch, otherwise local
  `main`, refusing ambiguous remotes. Routed Rex to workspace 1.
- 20261025: Added Rex project/all-project and worktree reopening pickers;
  documented native Pi activity reporting and trimmed the Rex guide.
- 20261023: Added Rex worktree create/open/delete actions with fzf prompts and
  safety checks, without consuming terminal Ctrl bindings.
- 20261022: Added the Rex Gruvbox import theme and native preference setup;
  globally ignored Claude `.cc-writes/` scratch output.
- 20261012: Routed Zed to workspace 10.
- 20261011: Made Pi review use a private Git index and merge-base comparisons.
  Expanded doctor shell/identity checks and hardened SSH setup; removed its
  thin Just wrapper. Documented host-local Neovim lock state.
- 20261009: Added Mac Claude settings, Gruvbox, fail-closed identity and web
  environment guidance while preserving Opus/xhigh, hooks and notifications.
  Moved Azure CLI to a cask.
- 20261007: Made review completion idempotent and fixed native startup probes
  for temporary paths. Verified answer submission/cancellation; remaining UI
  checks stayed pending. Moved Stow regression tests to standalone shell.
- 20261006: Set `openai/gpt-6.1-sol/high`, hardened answer extraction and UI
  guards, and persisted branch-aware review-summary requests/completions.
- 20261005: Added structured WAL/tldraw results and codemode alongside direct
  tools; simplified native Seatbelt policy.
- 20261002: Temporarily replaced Gondolin with native macOS Pi sandboxing;
  fixed doctor support for valid folded Stow links.
- 20261001: Moved Herdr Kitty graphics to `terminal.kitty_graphics`.

### 202609

- 20260929: Added the Bruno API client cask to the Brewfile.
- 20260926: Added a narrowly scoped Pi bridge to tldraw offline's host-local
  canvas API, including selected-canvas screenshot images for vision models;
  the app's skill stays host-installed and Gondolin gets no host shell access.
- 20260922: Restored Glow with its tracked config and classic Gruvbox Dark Hard
  Markdown style, using a portable Zsh style path instead of the old hard-coded
  home directory.
- 20260922: Tuned Ghostty padding and explicit Gruvbox cursor and selection
  colors; kept the preferred `0.9` opacity after a host comparison.
- 20260922: Chose classic Gruvbox Dark Hard as the palette reference, switched
  Zed to its built-in classic theme, and made Neovim's hard contrast explicit.
- 20260922: Added preview, typed backup, apply, and restore support for a focused
  set of intentional macOS behavioral defaults.
- 20260921: Pruned thin Just wrappers for standard Homebrew, directory, and npm
  commands; retained recipes that encode repository-specific behavior.
- 20260921: Added a non-mutating repository and host doctor with pytest-style
  results, verbose diagnostics, a portable check-only mode, and isolated Git
  identity regression tests.
- 20260921: Removed the retired `wt` shell helper after adopting Herdr's managed
  worktree workflow.
- 20260921: Added focused-window follow, monitor movement, and workspace balance
  actions to AeroSpace.
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

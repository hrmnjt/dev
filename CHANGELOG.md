# Changelog

Workflow changes worth remembering, newest first. Everything up to and
including [1.0.0] stays as one block at the bottom; changes after it are
expanded month by month. Full history lives in `git log`.

### 202610

- 20261006: Fixed `/review` so it no longer marks untracked files
  intent-to-add in the real Git index, and made `--base` diff from the merge
  base; scoped `GH_TOKEN` to a `pi` shell function; pinned the Gondolin image
  builder to the `package.json` version; added `UseKeychain` to SSH setup;
  extended doctor's syntax check to extensionless scripts and ran it in GitHub
  Actions; started tracking `lazy-lock.json`; moved the changelog out of the
  README; moved two type-only Pi imports to `@earendil-works`.
- 20261006: Added the Claude Code cask and a Stow-tracked `claude` package with
  user instructions, a fail-closed macOS sandbox with Homebrew/Stow/launchd
  prompts and credential denies, a uv guard hook ported from Pi, and disabled
  commit/PR attribution; the root `CLAUDE.md` imports `AGENTS.md`, which now
  covers both agents' execution environments, and doctor checks the `claude`
  command and uv guard decisions.
- 20261001: Added a concise decision-first TODO backlog for Pi compatibility,
  native sandboxing with Gondolin rollback, codemode, provider/model defaults,
  and extension maintenance; recorded deferred topics and local-first trials.
  Preserve the current Gruvbox/fullscreen experience. No runtime changes.
- 20261001: Moved Herdr's explicit Kitty graphics setting from the deprecated
  experimental key to `terminal.kitty_graphics`.

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

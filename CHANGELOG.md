# Changelog

Workflow changes worth remembering, newest first. Everything up to and
including [1.0.0] stays as one block at the bottom; changes after it are
expanded month by month. Full history lives in `git log`.

### 202610

- 20261007: Retired the native-migration planning backlog and its setup link.
  Implementation and host enforcement are verified; remaining manual checks
  and deferred provider/local-first work stay documented in `pi/README.md`,
  without marking those checks as passed.
- 20261007: Replaced the doctor Stow regression's JavaScript harness with a
  standalone shell script under `_scripts/tests/`; removed `_tests/meta/`.
  Preserve all six link-layout checks without adding a framework or dependency.
  Pi tests stay unchanged; documented their separate command. Canonicalize fixture
  temp roots with `pwd -P` so macOS `/var` and custom TMPDIR symlinks are not
  mistaken for deployment links. Six cases pass with normal and symlinked,
  trailing-slash TMPDIR paths; cleanup verified. Pi-only non-kernel suite:
  46 passed, 1 expected skip.
- 20261007: Verified live `/answer` extraction/submission with the selected
  `openai/gpt-6.1-sol`: four synthetic questions remain ordered, optional context
  and multiline answers survive normal-message submission, and form cancellation
  sends no answers (user confirmed). No sample project created. Navigation/answer
  retention, local-model extraction and the review UI checks remain pending.
- 20261007: Diagnosed repeat review completion from the active session entries:
  the review was already confirmed through `b2dadb3`. Repeated `complete` now
  reports that checkpoint without appending state or covering newer commits;
  absent/reset/rewritten/other-scope and unfinished reviews still reject it.
  Eight review regression tests pass; updated non-kernel suite: 52 passed,
  0 failed, 1 expected skip. All ten extensions load and strict semantic checks
  pass; repository doctor: 12 passed, no failures/warnings. Live reload/tree
  and other interactive checks remain; updated host verification is below.
- 20261007: Fixed Pi startup denial probes for project-local `TMPDIR` and
  temp-root launches by testing the already-protected scratch marker under the
  unchanged session profile. Both new mock regressions fail against the old
  source and pass after the fix; policy tests report 14 passes and one expected
  skip. User host rerun: 53 passed, 0 failed, 1 expected skip, including the
  expanded real Seatbelt launch/marker/cleanup cases; full doctor: 24 passed,
  0 failed, 0 warnings. Interactive closeout remains pending.
- 20261006: Confirmed user OpenAI OAuth and exact `gpt-6.1-sol` availability;
  set tracked `openai/gpt-6.1-sol/high` defaults and update the cloud shortlist,
  preserving both local models, codemode and appearance. User deferred real-task,
  image and provider checks. User applied the minimal host settings delta;
  runtime provider/model/high and exact-model thinking override are verified.
  Fresh-start procedure reported complete; old login retained.
- 20261006: Verified all ten tracked extensions with Pi's official loader,
  all-extension strict semantic checking and 45 non-kernel regression passes
  (one expected skip). Subsequent host Stow and the updated full suite pass:
  46 passed, 0 failed, 1 expected skip, including real Seatbelt enforcement;
  full doctor: 24 passed, 0 failed, 0 warnings. Native Git SSH
  `ls-remote` succeeds. Requested OpenAI model exists in the live catalog with
  image/reasoning support, but its provider is not authenticated; no loaded
  local model is available. Documented staged host checks/login and bounded
  privacy-safe local-first trials; defaults/auth/service state remain unchanged.
- 20261006: Refreshed official Pi imports and hardened `/answer` with
  provider-neutral authenticated extraction, validated/bounded question JSON,
  distinct cancellation/errors and session/model guards. Updated editor theme
  contracts, focus forwarding and review fullscreen mouse handling/cleanup.
  Nine UI/extraction regression tests and strict semantic checking of all
  tracked TypeScript extensions pass; real interactive/provider checks remain.
- 20261006: Persisted branch-aware review-summary requests and explicitly
  confirmed completion in Pi session entries. Pin Git ranges; unfinished/failed
  reviews never advance checkpoints. Reconstruct only the active session branch;
  isolate repository/worktree/branch/base/history scopes, with reset support.
  Six real-Git/SDK session regression tests and strict semantic type-check pass;
  interactive reload/tree verification remains pending.
- 20261005: Added structured WAL/tldraw results using Pi output schemas. Preserve
  direct text, arguments, permissions and screenshot images; scripts consume
  API JSON/WAL fields and forward screenshots with `image(result.image)` without
  returning internal paths or printing image bytes. Six serializer/schema,
  validation and SDK QuickJS transport tests pass. Live scratch-canvas structured
  search/exec, save, JPEG forwarding and app-error rejection pass; the disposable
  probe was removed and the original empty canvas saved. Approved WAL append,
  structured fields and exact-tail verification pass on 20261006; PI-05 is complete.
- 20261005: Added validated codemode `on` defaults alongside direct tools. Live
  scripted reads/writes/edits, uv rejection, nonzero exits, overflow-log access,
  external write rejection and partial-write failure behavior pass. Keep models,
  auth and appearance unchanged. Host runtime settings and fresh default startup
  are verified: direct tools + codemode remain available in `on` mode.
  Settings-delta regression tests pass.
- 20261005: Applied a host-approved correction to Pi's native policy: preserve
  Gondolin's launch-directory write boundary, normal bash Git/network/SSH, and
  editable Pi source. Use Seatbelt directly instead of sandbox-runtime's extra
  mandatory locks/proxies; remove that dependency and the native footer. Preserve
  private scratch, linked Git metadata, model-cache exclusion, uv routing, and
  fail-closed startup/identity. Candidate policy/registry and Stow tests pass
  (22 passed, 1 expected skip). Host npm cleanup reports zero vulnerabilities;
  corrected the fixture hook path to absolute `.git/hooks` without policy changes.
  The host Seatbelt kernel rerun passes, including hooks, loopback/Unix sockets,
  linked-worktree commits, images, overflow and cleanup. Full host suite:
  23 passed, 0 failed, 1 expected skip; doctor: 24 passed, 0 failed, 0 warnings.
  A fresh-process `/sandbox` confirms the corrected policy is loaded;
  codemode and interactive verification remain pending.
- 20261002: Fixed doctor's Stow check to accept valid folded directory links
  and reject links to the wrong checkout file; six regression cases pass.
- 20261002: Replaced Gondolin with native-only macOS Pi sandboxing for
  bash/read/write/edit, initially protected worktree/policy/Git paths, private scratch and
  overflow logs, and shared uv routing. Removed VM/runner dependencies, image
  configuration/recipe, VM-only Brew entries, and shell exports; updated review,
  bridge, doctor, deployment, and migration tests (canonical macOS temp paths
  and a valid PNG fixture). The macOS suite passes (16 passed, 1 expected skip),
  including real Seatbelt enforcement, images, overflow access, and cleanup;
  interactive verification remains pending. Authentication, models, appearance,
  and codemode settings are unchanged.
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

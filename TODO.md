# TODO

Plan for running Pi, Claude Code, and Amp inside Gondolin: goals, rules,
decisions with their sources, and a tracker. It says what, not how. New
questions are answered from existing practice first (see
[References](#references)) and invented only when nothing fits; record the
source and date with each answer.

## Goals

1. Run Pi in Gondolin, and prune Pi extensions and settings so the agent works
   freely within the VM's constraints.
2. Run Claude Code in Gondolin, with quality-of-life improvements that make
   working with it excellent.
3. Run Amp in Gondolin, to the same standard.

Gondolin is the one sandbox to manage. Inside it, agents act without asking.

## Rules

- Agents never act outside the VM. Claude Code and Amp run only in the VM and
  are not installed on the Mac; Pi's tools run only in the VM. Pi's `!` and
  `!!` are user commands and stay on the Mac.
- Real credentials stay in the Mac's Keychain; the guest sees placeholders.
  Never log in inside the VM, and never forward the SSH agent.
- Git identity stays fail-closed with no fallback (AGENTS.md).
- Inside the VM, `.pi/`, `.claude/`, `.git/hooks`, and the guest's global Git
  config are read-only. The repo's own `.git/config` stays writable.
- Fail closed: anything that can't start safely stops with a message naming
  the fix; nothing falls back to the Mac.
- Brew, Stow, `npm install --prefix ~/.pi/agent`, image builds, Keychain
  entries, logins, and GitHub settings are host steps for the user.

## Decisions

All decided on 2026-11-01. IDs match the tracker.

### Setup

- **W-01 Image and upgrades.** The guest root file system comes from a
  Debian-based Node image (like `node:24-bookworm-slim`) on Gondolin's Alpine
  boot layer. Claude Code, Amp, and Playwright are pinned in this repo and
  baked in; upgrading means bumping versions and rebuilding. Agent auto-update
  is off. Building needs Docker or Podman on the Mac (not Apple's
  `container`). *Source: Pi's Docker example, Claude's devcontainer,
  Playwright's system requirements.*
- **W-02 Credentials.** Claude uses a `claude setup-token` token, Amp an
  `sgamp_` access token, and GitHub a fine-grained token (W-12). All live in
  the Keychain; Gondolin gives the guest placeholders shaped like the real
  tokens and substitutes them only on requests to their own hosts. Revisit if
  a CLI rejects its placeholder. *Source: Pi's Docker Sandboxes example, Amp's
  execute-mode docs; Claude Code keeps its own Mac credentials in the
  Keychain.*

### Starting work

- **W-03 Entry point.** A Rex shortcut starts the chosen agent in a worktree
  tab by running the same command you can type. `claude` and `amp` on the Mac
  only start the VM; `claude setup-token` runs in a throwaway VM with nothing
  mounted. *Source: Docker Sandboxes' `sbx run <agent>`; the shortcut is the
  user's choice, with no reference.*
- **W-04, W-13 VM lifetime.** One VM per agent session, started with the agent
  and discarded on exit, so parallel agents run in parallel VMs. Revisit if
  boot time or reinstalls hurt; the memory budget comes from the baseline.
  *Source: Pi's Gondolin example, the pre-October setup.*
- **W-05 What the agent sees.** The workspace is mounted at its host path. For
  linked worktrees, the primary repo's common Git dir is also mounted at its
  host path, so agents commit and edits stay live in the Rex worktree. Agents
  may also run in the main `dev` checkout, whose files are live Stow targets:
  work happens on feature branches that the user merges, and agents aren't
  unattended yet. *Source: Docker Sandboxes (same path), the pre-October setup
  (common Git dir).*

### While the agent works

- **W-06 Status.** Claude and Pi report status to Rex natively through OSC
  7501, so the terminal must not be wrapped in tmux. Amp rings the terminal
  bell (`AMP_FORCE_BEL`) when done or blocked. *Source: Rex program-status
  docs, Claude Code terminal docs, Amp settings docs.*
- **W-07 Images.** Claude and Amp get `Ctrl+V` image paste through a host
  clipboard proxy that serves images only, never text. Pi keeps its
  `clipboard-image` extension. *Source: Docker Sandboxes'
  `clipboard.imagePaste`, narrowed to images.*
- **W-08 Reach.** The internet is open (Gondolin's default); tokens stay
  protected by host substitution. Mac services are blocked unless mapped in
  for a project, in this repo's config; the mapping is built when a project
  first needs one. *Source: Gondolin defaults, Claude Code on the web's Full
  level, Docker Sandboxes' explicit localhost allow.*
- **W-09 Looking inside.** `gondolin list` and `gondolin attach`; each VM's
  label names the agent and worktree. *Source: Gondolin CLI.*

### Checking and shipping

- **W-10 Previews.** Opt-in per session through Gondolin's ingress gateway, as
  an option on the typed command; the Rex shortcut starts agents without
  previews. The image includes Playwright with Chromium so agents can check
  their own web work. *Source: Docker Sandboxes' `--publish`, Gondolin ingress
  docs; the browser is the user's choice, with no sandbox reference.*
- **W-11 Review.** Agents edit the live worktree and open PRs, so review uses
  the usual Mac tools (Pi's `/review`, Neovim, Lazygit) and GitHub. *Source:
  follows from W-05 and W-12.*
- **W-12 Push and PRs.** Agents commit, push branches, and open PRs with a
  fine-grained GitHub token for chosen repos (Contents and Pull requests:
  write). The repos' SSH remotes are reached over HTTPS through substitution.
  A GitHub ruleset on `main` allows changes only through PRs and blocks
  force-pushes and deletion, for the user too. The user reviews and merges.
  *Source: Claude Code on the web's GitHub proxy, GitHub rulesets docs.*

### Over time

- **W-14 History.** One state folder per agent per project (primary repo),
  shared by that repo's worktrees and kept apart from other projects.
  *Source: Docker Sandboxes (state per sandbox), Claude's devcontainer (one
  volume per devcontainer).*
- **W-15 Failures.** A VM that won't start, an image missing or older than the
  pinned versions, or a missing Keychain token stops the launch with a message
  naming the host step that fixes it. `just doctor` warns before the Claude
  token's yearly expiry. *Source: the current Pi sandbox's fail-closed startup.*

### Per agent

- **W-16 Pi's shape.** Pi runs on the Mac and its built-in tools run in the
  VM; `!` and `!!` stay on the Mac. Pi's ChatGPT sign-in refreshes tokens, and
  keeping Pi on the host is the only referenced pattern that keeps them out of
  the guest. *Source: Pi's Gondolin example, the pre-October setup.*
- **W-17 Pi pruning.** Drop the `sandbox`, `uv`, and `wal-writer` extensions
  and turn off the `mcp` built-in. Keep answer, caffeinate, clipboard-image,
  exit, review, review-summary, tldraw, codemode, llama.cpp, and tool-search.
  *Source: user choice per extension.*
- **W-18 Claude and Amp settings.** Tracked in this repo (the `claude/` package
  rewritten for the VM, plus an Amp settings file) and mounted read-only.
  Claude runs as a non-root user, since it rejects
  `--dangerously-skip-permissions` as root. *Source: this repo's
  tracked-config convention, Claude's devcontainer docs.*
- **W-19 Clouds and the desktop app.** Claude Code on the web and Amp's cloud
  executor stay as a complement for phone, web, and long unattended work. The
  Claude desktop app stays for chat; its local Code sessions are turned off, or
  the app goes if no setting can. *Source: user requirement that agents never
  run on the Mac.*

### Boundary

- **W-20 Files the Mac runs.** `.pi/`, `.claude/`, `.git/hooks`, and the
  guest's global Git config are read-only in the VM. The repo's `.git/config`
  stays writable so agents can set upstreams; accepted consequence: an agent
  could point `core.hooksPath` at a writable folder, and host Git would run
  those hooks. *Source: Claude Code's sandbox write protections; the
  `.git/config` exception is the user's choice.*

## Tracker

Status: `[ ]` to do, `[~]` in progress, `[x]` done, `[-]` dropped (say why).

### 1. Prepare

- [ ] Create the implementation worktree from `main`.
- [ ] Record a host baseline: Pi, Gondolin, and QEMU versions; `just doctor`;
  VM boot time and memory per VM (W-04).
- [ ] Find a way to try branch config without deploying it, for Pi, the
  Claude/Amp launch command, and Rex.
- [ ] Walk through a working day with each agent and confirm it with the user.

### 2. Shared Gondolin setup

- [ ] Docker or Podman installed for image builds (host step, W-01).
- [ ] Guest image with pinned Claude Code, Amp, and Playwright (W-01).
- [ ] One place defines mounts (W-05), network (W-08), secrets (W-02), and
  fail-closed identity.
- [ ] Read-only paths and locked global Git config (W-20).
- [ ] Claude, Amp, and GitHub tokens in the Keychain (W-02, W-12).
- [ ] One VM per session, labelled for `gondolin list`/`attach`; launch fails
  closed and names the fix (W-04, W-09, W-15).
- [ ] GitHub ruleset on `main` for each repo agents push to; confirm rulesets
  work for private repos on the current plan (W-12).

### 3. Pi

- [ ] Pi runs on the Mac with its built-in tools in the VM; `!` and `!!` stay
  on the Mac (W-16).
- [ ] Bash overflow logs written by host Pi are readable by the VM's tools
  (the earlier plan's PI-03).
- [ ] Drop `sandbox`, `uv`, and `wal-writer`; turn off `mcp` (W-17).
- [ ] Tests and doctor checks match the new setup.

### 4. Claude Code

- [ ] Runs as a non-root user without approval prompts, with tracked
  read-only settings (W-18).
- [ ] Rex shortcut and typed `claude` start it in the VM (W-03).
- [ ] Status reaches Rex through OSC 7501 (W-06).
- [ ] `Ctrl+V` image paste through the images-only proxy (W-07).
- [ ] Opt-in previews; Playwright available (W-10).
- [ ] Commits, pushes, and opens PRs (W-12).
- [ ] History and memory per project (W-14).
- [ ] Once it works in the VM, remove the Mac install and retire or repurpose
  the Mac-only parts of the `claude/` package (W-03).
- [ ] Turn off the desktop app's local Code sessions, or remove the app
  (W-19).

### 5. Amp

- [ ] Pinned in the image; signs in with the `sgamp_` token (W-01, W-02).
- [ ] Runs without approval prompts, with tracked read-only settings; confirm
  its allow-all flag with `amp --help` (W-18).
- [ ] Rex shortcut and typed `amp` start it in the VM (W-03).
- [ ] Bell on done and blocked (W-06).
- [ ] Image paste, previews, Playwright, pushes and PRs, and per-project
  history, as for Claude (W-07, W-10, W-12, W-14).

### 6. Ship

- [ ] Docs: package READMEs, root README setup, AGENTS.md **Execution
  environment**, and the changelog.
- [ ] Merge. The user deploys (Stow, npm, image, reload) and verifies on the
  host.
- [ ] Move lasting content into package READMEs and retire this file.

### Later

- [ ] An Amp plugin that turns its state events into OSC 7501 (W-06).
- [ ] Per-project Mac service mapping, when a project needs one (W-08).
- [ ] Revisit agents in the main `dev` checkout before running unattended
  (W-05).
- [ ] Keep VMs per worktree if per-session boot or reinstalls hurt (W-04).

## Developing in a worktree

- Stow links in `~` point into the main checkout, so package edits in a
  worktree change nothing live. Root files (`Brewfile`, `README.md`, this
  file) are never deployed.
- Don't run `just stowall` from a worktree: Stow deploys from the current
  directory, so new files would link into the worktree.
- A worktree shares the main repo's `.git` (branches, hooks, config).
- Host installs are shared everywhere: Brew packages, Gondolin's image cache,
  Keychain entries, and state folders.
- `npm install --prefix ~/.pi/agent` writes into live Pi and reads `main`'s
  `package.json`. A test install there changes live Pi and is removed by the
  next normal install.
- Pi loads the deployed extensions from `~/.pi/agent`, so `pi -e <branch
  file>` alone would load a second sandbox backend beside the deployed one.
  Pi supports `PI_CODING_AGENT_DIR` and `--no-extensions`; the latter also
  drops built-ins, which `-e builtin:<name>` restores.
- Rex reads its config from the deployed files; no way to try branch Rex
  config without deploying is known yet.
- Merging is deploying. After pulling `main`, new sessions see changed files at
  once; new files need `just stowall` from `main`; deleted files leave broken
  links until restowed; running Pi sessions keep old code until `/reload`.

## Notes

- 2026-11-01: Gondolin 0.14.0 is current (the old setup used 0.12.0); Pi 1.4.0
  is current on npm. Gondolin's CLI uses `Ctrl-]` to force-close a session,
  which Claude Code also binds; the SDK's `vm.exec` attaches a terminal
  without it.
- 2026-10-05: `94dff1f` replaced Gondolin with native Seatbelt write
  confinement. The earlier plan and its overflow-log issue (PI-03) are in
  `git show 70cd63e:TODO.md`.

## References

Starting points: Pi's official Gondolin example for Pi's tool routing, with
this repo's old extension as a source for what the example lacks (common Git
dir mount, identity selection, read-only paths).

- Pi 1.4 package: `docs/containerization.md` and
  `examples/extensions/gondolin/`.
- This repo's previous Gondolin backend:
  `git show 94dff1f^:pi/.pi/agent/extensions/gondolin.ts`, plus the image JSON,
  Justfile recipe, and `.zshrc` lines removed in `94dff1f`.
- [Gondolin](https://earendil-works.github.io/gondolin/): custom images,
  ingress, SDK networking, and `gondolin bash --help`.
- [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/): architecture, Git
  workflow, development (ports), FAQ (image paste), and
  [agent kits](https://github.com/docker/sbx-kits-contrib).
- Claude Code docs:
  [devcontainer](https://code.claude.com/docs/en/devcontainer) and its
  [reference files](https://github.com/anthropics/claude-code/tree/main/.devcontainer),
  [terminal config](https://code.claude.com/docs/en/terminal-config),
  [hooks](https://code.claude.com/docs/en/hooks), and
  [cloud environments](https://code.claude.com/docs/en/cloud-environments).
- [Amp CLI](https://ampcode.com/docs/cli), its
  [settings](https://ampcode.com/docs/cli/settings), and
  [plugin API](https://ampcode.com/docs/plugin-api).
- [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
  and [fine-grained tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).
- [Playwright system requirements](https://playwright.dev/docs/intro).
- [Rex program status](https://www.superlogical.com/rex/docs/build/program-status).

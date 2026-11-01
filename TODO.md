# TODO

Plan for running Pi, Claude Code, and Amp inside Gondolin. It holds the goals,
the workflow questions to answer, what is known so far, and a tracker. It says
what, not how: answers come from existing practice first (see
[References](#references)), and are invented only when nothing fits.

## Goals

1. Run Pi in Gondolin, and prune Pi extensions and settings so the agent works
   freely within the VM's constraints.
2. Run Claude Code in Gondolin, with quality-of-life improvements that make
   working with it excellent.
3. Run Amp in Gondolin, to the same standard.

Gondolin is the one sandbox to manage. Inside it, agents act without asking.

## Ground rules

- Implement on `feat/meta/gondolin-agent-sandbox` in a Rex worktree created
  after this file is on `main`. `main` stays the deployed config until the
  branch merges. See [Developing in a worktree](#developing-in-a-worktree).
- Brew, Stow, `npm install --prefix ~/.pi/agent`, image builds, logins, and
  Keychain changes are host steps for the user.
- Answer a workflow question by adding `Answer:` (the choice), `Source:` (a
  reference, or `invented` and why nothing fit), and the date. `Idea:` lines
  are earlier suggestions with no reference behind them; check the references
  before using one.

Working assumptions (revisit if the references argue otherwise):

- Real credentials stay on the Mac; the guest gets substitutes.
- Git identity stays fail-closed with no fallback (AGENTS.md).
- Agents work in worktrees. The main `dev` checkout is the deployed config.

## Tracker

Status: `[ ]` to do, `[~]` in progress, `[x]` done, `[-]` dropped (say why).

### 1. Prepare

- [ ] Create the implementation worktree from `main`.
- [ ] Record a host baseline: Pi, Claude Code, Amp, Gondolin, and QEMU
  versions; `just doctor`.
- [ ] Find a way to try branch config without deploying it, for Pi, the
  Claude/Amp launch path, and Rex.

### 2. Decide the workflow

- [ ] Study the references and note what each does per question.
- [ ] Answer W-01 to W-19, with sources.
- [ ] Walk through a working day with each agent and confirm it with the user.

### 3. Shared Gondolin setup

- [ ] Gondolin and a guest image that runs all three agents (W-01).
- [ ] One place defines what agents can reach: mounts, network, secrets, and
  identity (W-05, W-08).
- [ ] Credentials stay on the host (W-02).
- [ ] Git identity stays fail-closed inside the VM.

### 4. Pi

- [ ] Pi runs in Gondolin in the chosen shape (W-16).
- [ ] Extensions and built-ins pruned (W-17); native sandbox retired.
- [ ] Pi works freely inside the VM without approval friction.
- [ ] Tests and doctor checks match the new setup.

### 5. Claude Code

- [ ] Claude Code runs in Gondolin without approval prompts (W-18).
- [ ] Quality-of-life items from the workflow answers (list them here).

### 6. Amp

- [ ] Install Amp where W-01 decides: the host `Brewfile`, the guest image, or
  both. Include sign-in (W-02) and setup docs.
- [ ] Amp runs in Gondolin without approval prompts (W-18).
- [ ] Quality-of-life items from the workflow answers (list them here).

### 7. Ship

- [ ] Docs: package READMEs, root README setup, AGENTS.md **Execution
  environment**, and the changelog.
- [ ] Merge. The user deploys (Stow, npm, image, reload) and verifies on the
  host.
- [ ] Move lasting content into package READMEs and retire this file.

## Workflow questions

### Set up once

- **W-01 Install and upgrade.** How do Gondolin, the guest image, and each
  agent get installed and upgraded? Who triggers upgrades, and how often?
  - Known: `gondolin build` makes images from Alpine, NixOS, or an OCI image,
    with read-only, memory, or copy-on-write root filesystems. Claude Code on
    Alpine (musl) needs `libgcc`, `libstdc++`, and `ripgrep` with
    `USE_BUILTIN_RIPGREP=0` (verify).
  - Known: Amp's official Homebrew formula is `ampcode/tap/ampcode`; it
    installs the `amp` command. `amp login` signs in through the browser.
- **W-02 Credentials.** How does each agent authenticate without the guest
  holding a real token? How are tokens created, stored, and renewed?
  - Known: Pi's isolation guide and Docker Sandboxes keep provider credentials
    on the host and substitute them in outbound requests. Docker uses an
    OAuth-shaped placeholder (`sk-ant-oat01-{rand}`) for `claude setup-token`
    tokens. Gondolin substitutes secrets in HTTP headers, including Basic auth;
    whether its placeholders pass each CLI's checks is untested.

### Start a task

- **W-03 Entry point.** Where does a task start: a Rex shortcut that makes a
  worktree and starts an agent, or a command in an existing tab? How are VM and
  host versions of the same agent told apart?
- **W-04 Startup time.** How long does a VM take to boot, and does it need
  pre-warming, reuse per worktree, or sharing between agents?
  - Known: Gondolin can use `krun` on Apple Silicon (the old setup did) and can
    snapshot and resume VMs.
- **W-05 What the agent sees.** Which host folders are mounted, read-write or
  read-only, and at which guest paths? What about linked-worktree Git metadata,
  other repos, and docs?
  - Known: Pi's Gondolin example mounts the working folder at `/workspace`. The
    old setup also mounted the primary repo's common Git dir so worktrees
    could commit, and translated host paths to `/workspace`.

### While the agent works

- **W-06 Status and attention.** How do I see working, waiting, and done states
  across tabs, and get notified?
  - Known: Rex shows program status from OSC 7501; Pi emits it natively.
    Terminal output passes through the VM unchanged. Claude and Amp support is
    unknown.
  - Idea: in-VM agent hooks write the OSC 7501 sequence to the terminal.
- **W-07 Giving context.** How do I hand over screenshots, images, files
  outside the worktree, and links?
  - Known: Pi's `clipboard-image` extension attaches host clipboard images
    before tools run. A whole agent inside the VM can't see the Mac clipboard.
    Gondolin's HTTP hooks can answer guest requests with host code.
  - Idea: a Rex shortcut saves the clipboard image somewhere the VM can see and
    types its path into the agent.
- **W-08 Reach.** What can the agent reach on the internet and on the Mac
  (local services, local models)?
  - Known: Gondolin allows all HTTP by default, blocks internal addresses, and
    can map chosen addresses (`--tcp-map`). TLS passes through Gondolin's CA,
    which its guest init exports via `NODE_EXTRA_CA_CERTS` and `SSL_CERT_FILE`.
- **W-09 Looking inside.** How do I inspect, interrupt, or take over a running
  VM?
  - Known: `gondolin list` and `gondolin attach` open another shell in a
    running VM.

### Check the work

- **W-10 Previews.** How do I open a dev server or app the agent started?
  - Known: Gondolin has an ingress gateway (`--listen`).
- **W-11 Review.** How do I review the agent's changes before they are
  committed or pushed?
  - Known: Pi has `/review` (Neovim on the host).

### Ship

- **W-12 Commit, push, PR.** Which of these does the agent do, which do I do,
  and with what credentials?
  - Known: the old setup forwarded the SSH agent, which let the agent push
    anything the key could. Gondolin also supports an SSH host allowlist and
    HTTPS token substitution.

### Over time

- **W-13 Parallel work.** How many agents run at once, with one VM each or
  shared, and within what memory budget?
- **W-14 History.** Where do sessions live, how are they resumed, and are VM
  and host histories shared?
  - Known: sharing host `~/.claude/projects` would let a VM agent write memory
    files that host Claude loads.
- **W-15 Failures.** What do I see when the VM fails to start, the image is
  stale, or a token expires?

### Per agent

- **W-16 Pi's shape.** Whole Pi inside the VM, or host Pi with its tools in the
  VM? Do `!` commands run in the VM or on the host?
  - Known: Pi's isolation guide compares both. Host routing keeps extensions on
    the host. Pi's Gondolin example routes `!` into the VM; the old setup kept
    `!` on the host.
- **W-17 Pi pruning.** Which extensions and built-ins still earn their place
  once the VM is the boundary?
  - Current extensions: answer, caffeinate, clipboard-image, exit, review,
    review-summary, sandbox (native), tldraw, uv, wal-writer. Built-ins:
    codemode, mcp, llama.cpp, tool-search.
- **W-18 Claude and Amp settings.** Which settings differ inside the VM
  (permissions, sandbox, hooks, status line, notifications, keys), and how is
  it obvious that a session runs in the VM?
  - Known: host Claude settings require the macOS Bash sandbox and run Rex and
    Herdr hooks that need host sockets. The `gondolin` CLI uses `Ctrl-]` to
    force-close a session, which Claude Code also binds; the SDK's `vm.exec`
    can attach a terminal directly. Claude Code refuses
    `--dangerously-skip-permissions` when running as root (verify).
- **W-19 Local VM or vendor cloud.** When is the local VM better than Claude
  Code's cloud environments (already set up) or Amp's cloud executor?
  - Known: `amp --executor local` runs Amp's tools on the machine it starts on
    rather than in an Amp cloud orb; model inference still uses Amp's service.

## Developing in a worktree

- Stow links in `~` point into the main checkout, so package edits in a
  worktree change nothing live. Root files (`Brewfile`, `README.md`, this
  file) are never deployed.
- Don't run `just stowall` from a worktree: Stow deploys from the current
  directory, so new files would link into the worktree.
- A worktree shares the main repo's `.git` (branches, hooks, config). Agents
  working in it can't change `main`'s files but can move refs and write hooks.
- Host installs are shared everywhere: Brew packages, Gondolin's image cache,
  Keychain entries, and new state directories.
- `npm install --prefix ~/.pi/agent` writes into live Pi and reads `main`'s
  `package.json`. A test install there changes live Pi and is removed by the
  next normal install.
- Pi loads the deployed extensions from `~/.pi/agent`. `pi -e <branch file>`
  alone would load a second sandbox backend beside the deployed one. Pi
  supports `PI_CODING_AGENT_DIR` and `--no-extensions`; the latter also drops
  built-ins, which `-e builtin:<name>` restores.
- Rex reads its config from the deployed files; no way to try branch Rex
  config without deploying is known yet.
- Merging is deploying. After pulling `main`, new sessions see changed files at
  once; new files need `just stowall` from `main`; deleted files leave broken
  links until restowed; running Pi sessions keep old code until `/reload`.

## Risks to keep in view

- Mounted folders are real host files. Writes to `.git/hooks` or `.git/config`
  run on the Mac the next time Git runs there.
- The main `dev` checkout holds live Stow targets (Claude hooks, `.zshrc`).
- A forwarded SSH agent lets the agent push or force-push anything the key can.
- Logging in inside the VM writes a real token into the guest.

## Notes

Dated findings; add to these as work happens.

- 2026-11-01: Gondolin 0.14.0 is current (the old setup used 0.12.0) and still
  exports `VM`, `RealFSProvider`, `ShadowProvider`, and `createHttpHooks`. Pi
  1.4.0 is current on npm. `pi` is not on `PATH` inside Claude's sandbox, so
  check the host version directly.
- 2026-11-01: Dropped the uncommitted host-Amp edits on `main` (`Brewfile`
  formula, README setup step and "Amp CLI" section). Their facts are in W-01
  and W-19; installing Amp is tracked in section 6.
- 2026-10-05: `94dff1f` replaced Gondolin with native Seatbelt write
  confinement. The earlier plan and its open overflow-log issue (PI-03) are in
  `git show 70cd63e:TODO.md`.

## References

Study these before answering; add others as they turn up.

- Pi 1.4 package: `docs/containerization.md` (Docker, Docker Sandboxes,
  OpenShell, and Gondolin compared) and `examples/extensions/gondolin/`.
- This repo's previous Gondolin backend:
  `git show 94dff1f^:pi/.pi/agent/extensions/gondolin.ts`, plus the image JSON,
  Justfile recipe, and `.zshrc` lines removed in `94dff1f`.
- [Gondolin](https://earendil-works.github.io/gondolin/): `gondolin bash --help`
  covers `--cmd`, `--host-secret`, `--listen`, and `attach`.
- [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) and its agent kits
  ([sbx-kits-contrib](https://github.com/docker/sbx-kits-contrib)).
- Claude Code docs: development containers, sandboxing, hooks, status line, and
  [cloud environments](https://code.claude.com/docs/en/cloud-environments).
- [Amp CLI](https://ampcode.com/docs/cli), including its executor options.
- [Rex program status](https://www.superlogical.com/rex/docs/build/program-status).

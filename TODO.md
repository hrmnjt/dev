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
Agents never act outside it: Claude Code and Amp run only in the VM, and Pi's
tools run only in the VM.

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
  versions; `just doctor`; VM boot time and memory per VM (W-04, W-13).
- [ ] Find a way to try branch config without deploying it, for Pi, the
  Claude/Amp launch path, and Rex.

### 2. Decide the workflow

- [x] Study the references and note what each does per question.
- [x] Answer W-01 to W-20, with sources (2026-11-01).
- [ ] Walk through a working day with each agent and confirm it with the user.

### 3. Shared Gondolin setup

- [ ] Choose and install Docker or Podman for image builds (host step, W-01).
- [ ] A Debian-based guest image with pinned Claude Code, Amp, and Playwright
  that runs all three agents (W-01).
- [ ] One place defines what agents can reach: workspace and common Git dir
  at host paths (W-05), open internet and per-project Mac services (W-08),
  host-held secrets (W-02), and fail-closed identity.
- [ ] Paths that run on the Mac are read-only in the VM: `.pi/`, `.claude/`,
  `.git/hooks`, and `.git/config` (W-20).
- [ ] Credentials stay on the host, in the Keychain (W-02).
- [ ] Git identity stays fail-closed inside the VM.
- [ ] One VM per agent session, labelled for `gondolin list`/`attach`; launch
  fails closed and names the fix (W-04, W-09, W-15).
- [ ] Agents push branches and open PRs with a limited GitHub token; `main` is
  protected by a GitHub ruleset on each repo they push to (W-12). Confirm
  rulesets are available for private repos on the current GitHub plan.

### 4. Pi

- [ ] Pi runs on the Mac with its built-in tools in the VM; `!` and `!!` stay
  on the Mac (W-16).
- [ ] Drop the `sandbox`, `uv`, and `wal-writer` extensions and turn off the
  `mcp` built-in (W-17).
- [ ] Pi works freely inside the VM without approval friction.
- [ ] Tests and doctor checks match the new setup.

### 5. Claude Code

- [ ] Claude Code runs in Gondolin as a non-root user without approval
  prompts, with tracked read-only settings (W-18).
- [ ] A Rex shortcut starts Claude in a worktree tab; typed `claude` on the
  Mac also starts the VM (W-03).
- [ ] Status reaches Rex through Claude's native OSC 7501 (W-06).
- [ ] `Ctrl+V` pastes images through an images-only clipboard proxy (W-07).
- [ ] Opt-in previews through Gondolin's gateway; Playwright for the agent's
  own checks (W-10).
- [ ] Commits, pushes branches, and opens PRs (W-12).
- [ ] History and memory per project (W-14).
- [ ] Once Claude in the VM works, remove the Mac install and retire or
  repurpose the `claude/` Stow package (W-03).
- [ ] Keep the Claude desktop app for chat; turn off its local Code sessions,
  or remove the app if no setting does (W-19).

### 6. Amp

- [ ] Install Amp, pinned, in the guest image only; sign in with an `sgamp_`
  token from the Keychain (W-01, W-02, W-03).
- [ ] Amp runs in Gondolin without approval prompts, with tracked read-only
  settings; confirm its allow-all flag with `amp --help` (W-18).
- [ ] A Rex shortcut starts Amp in a worktree tab; typed `amp` on the Mac
  also starts the VM (W-03).
- [ ] Done and blocked ring the terminal bell (`AMP_FORCE_BEL`); investigate a
  plugin that reports OSC 7501 (W-06).
- [ ] `Ctrl+V` image paste, previews, Playwright, pushes and PRs, and
  per-project history, as for Claude (W-07, W-10, W-12, W-14).

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
  - Known: Playwright supports Debian 12/13 and Ubuntu; Alpine isn't listed.
    Claude's reference devcontainer uses `node:20` (Debian), installs Claude
    with `npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}`
    (build argument, default `latest`), and runs as the non-root `node` user.
    Pi's Docker example uses `node:24-bookworm-slim`. Gondolin always boots an
    Alpine kernel and initramfs but can swap in an OCI root filesystem such as
    `debian:bookworm-slim`; OCI pulls, and on macOS any build with
    `postBuild.commands`, need Docker or Podman (not Apple's `container`).
  - Answer: the guest root file system comes from a Debian-based Node image
    (like `node:24-bookworm-slim`) on Gondolin's Alpine boot layer, so
    Playwright and Claude run on glibc. Building it needs Docker or Podman on
    the Mac. Source: Pi's Docker example, Claude's devcontainer, Playwright's
    system requirements. 2026-11-01.
  - Answer: Claude Code, Amp, and Playwright versions are pinned in this repo
    and baked into the image; upgrading means bumping versions and
    rebuilding, a user step. Agent auto-update stays off. Source: Claude's
    devcontainer version argument, Docker Sandboxes' pinned kits. 2026-11-01.
- **W-02 Credentials.** How does each agent authenticate without the guest
  holding a real token? How are tokens created, stored, and renewed?
  - Known: Pi's isolation guide and Docker Sandboxes keep provider credentials
    on the host and substitute them in outbound requests. Docker uses an
    OAuth-shaped placeholder (`sk-ant-oat01-{rand}`) for `claude setup-token`
    tokens. Gondolin substitutes secrets in HTTP headers, including Basic auth;
    whether its placeholders pass each CLI's checks is untested.
  - Known: Pi's isolation guide warns that commands in its Gondolin example
    inherit the host environment, so provider keys in environment variables
    are visible in the VM.
  - Known: Amp's docs use an access token from Amp settings (`sgamp_…`) in
    `AMP_API_KEY` for non-interactive use; the `amp login` token expires within
    an hour and can't be refreshed from an environment variable. Claude Code's
    devcontainer docs sign in inside the container and persist `~/.claude` in
    a volume, and suggest a `claude setup-token` token as a secret for
    Codespaces. Gondolin secrets accept a custom placeholder per secret.
  - Answer: Claude uses a `claude setup-token` token and Amp an `sgamp_` access
    token. Both stay on the Mac; the guest gets a placeholder shaped like the
    real token, which Gondolin replaces only on requests to Anthropic or Amp.
    If a CLI rejects the placeholder, revisit. Source: Pi's Docker Sandboxes
    example, Amp's execute-mode docs. 2026-11-01.
  - Answer: tokens live in the macOS Keychain and are read at launch. Source:
    Claude Code stores its own Mac credentials in the Keychain. 2026-11-01.

### Start a task

- **W-03 Entry point.** Where does a task start: a Rex shortcut that makes a
  worktree and starts an agent, or a command in an existing tab? How are VM and
  host versions of the same agent told apart?
  - Known: Docker Sandboxes starts agents with an explicit `sbx run <agent>`
    from the project folder and reuses the sandbox until it is removed.
  - Answer: a Rex shortcut starts the chosen agent in a worktree tab. It runs a
    command underneath, which also works when typed. Rex config can't be tried
    on a branch before merging (see Developing in a worktree). Source: user
    choice; no reference found for agent-starting worktree shortcuts.
    2026-11-01.
  - Answer: there is no Mac version to tell apart. `claude` and `amp` always
    start the VM version. Source: user requirement. 2026-11-01.
  - Answer: Claude Code and Amp are not installed on the Mac; `claude` and
    `amp` there only start the VM. `claude setup-token` runs in a throwaway VM
    with nothing mounted. Claude sessions on the Mac end, and the `claude/`
    Stow package becomes VM settings or goes away. Source: user requirement
    that agents never run outside the VM. 2026-11-01.
- **W-04 Startup time.** How long does a VM take to boot, and does it need
  pre-warming, reuse per worktree, or sharing between agents?
  - Known: Gondolin can use `krun` on Apple Silicon (the old setup did) and can
    snapshot and resume VMs. Its docs say VMs "boot in under a second". Docker
    Sandboxes keeps one sandbox per workspace, stopped and reused until
    removed.
  - Answer: one VM per agent session, started with the agent and discarded on
    exit; nothing to pre-warm or clean up. Project files and dependencies live
    in the mounted worktree; tools are in the image. Revisit if boot time or
    reinstalls hurt. Source: Pi's Gondolin example and the pre-October setup.
    2026-11-01.
- **W-05 What the agent sees.** Which host folders are mounted, read-write or
  read-only, and at which guest paths? What about linked-worktree Git metadata,
  other repos, and docs?
  - Known: Pi's Gondolin example mounts the working folder at `/workspace`. The
    old setup also mounted the primary repo's common Git dir so worktrees
    could commit, and translated host paths to `/workspace`.
  - Known: dependencies the agent installs in the worktree (`node_modules`,
    `.venv`) are built for Linux in the VM, so host commands may fail on them.
  - Known: Docker Sandboxes mounts the workspace at the same absolute path so
    errors, configs, and build output name paths that exist on the host. For a
    host worktree it mounts only the worktree, so the agent has no Git; its
    alternative is a clone inside the sandbox, synced by fetch or push.
  - Answer: mount the workspace at its host path. Source: Docker Sandboxes.
    2026-11-01.
  - Answer: for linked worktrees, also mount the primary repo's common Git dir
    at its host path, so the agent can commit and edits stay live in the Rex
    worktree. Hooks and config stay read-only (W-20); the agent can still move
    any branch ref, including `main`. Source: the pre-October setup.
    2026-11-01.

### While the agent works

- **W-06 Status and attention.** How do I see working, waiting, and done states
  across tabs, and get notified?
  - Known: Rex shows program status from OSC 7501 (`working`, `blocked`,
    `done`, `error`, `idle`) written to the terminal. Pi emits it natively, and
    so does Claude Code from v2.1.295 (not inside tmux). Claude hooks can't
    write to the terminal. Amp has no OSC 7501 support; it plays a sound when
    done or blocked, or rings the terminal bell with `AMP_FORCE_BEL`. Amp
    plugins get `agent.start`/`agent.end` and `thread.state` events but have no
    documented way to write to the terminal.
  - Answer: Claude and Pi need nothing extra; keep terminal output unwrapped
    (no tmux) so their OSC 7501 reaches Rex. Amp rings the terminal bell
    (`AMP_FORCE_BEL`) for done and blocked. Later, investigate an Amp plugin
    that turns its state events into OSC 7501. Source: Rex program-status
    docs, Claude Code terminal docs, Amp settings docs. 2026-11-01.
- **W-07 Giving context.** How do I hand over screenshots, images, files
  outside the worktree, and links?
  - Known: Pi's `clipboard-image` extension attaches host clipboard images
    before tools run. A whole agent inside the VM can't see the Mac clipboard.
    Gondolin's HTTP hooks can answer guest requests with host code.
  - Known: Docker Sandboxes has an opt-in `clipboard.imagePaste` setting:
    `Ctrl+V` then pastes host clipboard images into Claude Code and Codex
    through a host-side proxy. It is off by default because the sandbox could
    read the host clipboard. Text paste always works through the terminal.
    Claude Code also accepts drag and drop and image file paths; Amp accepts
    `Ctrl+V` and drag and drop. macOS screenshots go to `~/Downloads` (set by
    `_scripts/macos-defaults.sh`).
  - Answer: Claude and Amp get `Ctrl+V` image paste through a host clipboard
    proxy that serves images only, never text. Take screenshots to the
    clipboard. Pi keeps its `clipboard-image` extension. Source: Docker
    Sandboxes' `clipboard.imagePaste`, narrowed to images. 2026-11-01.
- **W-08 Reach.** What can the agent reach on the internet and on the Mac
  (local services, local models)?
  - Known: Gondolin allows all HTTP by default, blocks internal addresses, and
    can map chosen addresses (`--tcp-map`). TLS passes through Gondolin's CA,
    which its guest init exports via `NODE_EXTRA_CA_CERTS` and `SSL_CERT_FILE`.
  - Known: Claude Code on the web defaults to "Trusted" (package registries,
    GitHub, cloud SDKs, Anthropic), with None, Full, and Custom levels. Claude's
    devcontainer firewall is default-deny with a small allowlist. Docker
    Sandboxes enforces policy in a host proxy (default not confirmed) and
    reaches host services only after allowing a specific `localhost:port`.
    Gondolin calls its mapped host TCP "a narrow exception path".
  - Answer: open internet, Gondolin's default; tokens stay protected by host
    substitution, and code can leave through any site. Source: Gondolin
    default, Claude Code on the web's Full level. 2026-11-01.
  - Answer: Mac services are blocked unless mapped in for a project. The
    mappings live in this repo's config, not the project, so agents can't add
    their own. Source: Docker Sandboxes' explicit localhost allow, Gondolin's
    mapped TCP. 2026-11-01.
- **W-09 Looking inside.** How do I inspect, interrupt, or take over a running
  VM?
  - Known: `gondolin list` and `gondolin attach` open another shell in a
    running VM.
  - Answer: use `gondolin list` and `gondolin attach`; each VM's session label
    names the agent and worktree, as the old extension's did. Source: Gondolin
    CLI. 2026-11-01.

### Check the work

- **W-10 Previews.** How do I open a dev server or app the agent started?
  - Known: Gondolin has an ingress gateway (`--listen`).
  - Known: Docker Sandboxes publishes ports explicitly (`--publish 8080:3000`,
    `sbx ports`), bound to host `127.0.0.1`; servers must listen on all guest
    interfaces. Gondolin's ingress is HTTP-only (WebSockets work), binds host
    `127.0.0.1` on a random port by default, and routes by path prefix from
    the guest's `/etc/gondolin/listeners` or the SDK. Claude in Chrome runs on
    the host and is off when signed in with a `setup-token` token. No
    reference puts a browser inside the sandbox.
  - Answer: previews are opt-in per session, like Docker's `--publish`; the
    typed launch command takes the option, and how the Rex shortcut offers it
    is still open. Source: Docker Sandboxes, Gondolin ingress docs.
    2026-11-01.
  - Answer: the guest image includes a headless browser (Playwright with
    Chromium) so agents can load pages and take screenshots of their own
    work. Playwright's bundled browsers target glibc, not Alpine's musl
    (verify); this may decide the base image (W-01). Source: user choice; no
    sandbox reference. 2026-11-01.
- **W-11 Review.** How do I review the agent's changes before they are
  committed or pushed?
  - Known: Pi has `/review` (Neovim on the host).
  - Answer: agents edit the live worktree and open PRs (W-05, W-12), so review
    uses the usual Mac tools (Pi's `/review`, Neovim, Lazygit) and GitHub PRs.
    Nothing VM-specific is needed. Source: follows from earlier answers; Docker
    Sandboxes' direct mode likewise shows edits live on the host. 2026-11-01.

### Ship

- **W-12 Commit, push, PR.** Which of these does the agent do, which do I do,
  and with what credentials?
  - Known: the old setup forwarded the SSH agent, which let the agent push
    anything the key could. Gondolin also supports an SSH host allowlist and
    HTTPS token substitution.
  - Known: Docker Sandboxes lets agents push and open PRs with host-held
    credentials ("Push feat/my-feature to origin and open a PR").
  - Known: fine-grained GitHub tokens are limited by repository and permission,
    never by branch. Claude Code on the web keeps GitHub credentials outside
    the VM in a proxy that blocks branch deletions and tags but "doesn't limit
    which branches a push can update"; GitHub rulesets or branch protection do
    that. A token acts as its user, so a rule that blocks it also blocks the
    user unless both bypass. Whether rulesets work on private repos on GitHub
    Free is unverified. The repos' `origin` remotes use SSH, which the VM has no
    key for; Gondolin substitutes tokens in HTTPS Basic auth.
  - Answer (replaces "agent commits, user pushes"): agents commit, push
    branches, and open PRs with a fine-grained GitHub token for chosen repos
    (Contents and Pull requests: write). The token stays in the Keychain and
    Gondolin substitutes it, as for W-02. A GitHub ruleset on `main` allows
    changes only through PRs and blocks force-pushes and deletion, for the
    user too. The user reviews and merges. Source: Claude Code on the web's
    GitHub proxy and GitHub rulesets docs. 2026-11-01.

### Over time

- **W-13 Parallel work.** How many agents run at once, with one VM each or
  shared, and within what memory budget?
  - Answer: one VM per running agent (W-04); the memory budget comes from the
    baseline measurement. Source: follows from W-04. 2026-11-01.
- **W-14 History.** Where do sessions live, how are they resumed, and are VM
  and host histories shared?
  - Known: sharing host `~/.claude/projects` would let a VM agent write memory
    files that host Claude loads.
  - Answer: one state folder per agent per project (primary repo), shared by
    that repo's worktrees. Resume and memory carry across branches; other
    projects, work and personal, stay invisible. Source: Docker Sandboxes keeps
    state per sandbox and workspace; Claude's devcontainer keeps one volume
    per devcontainer. 2026-11-01.
- **W-15 Failures.** What do I see when the VM fails to start, the image is
  stale, or a token expires?
  - Answer: fail closed and name the fix. A VM that won't start, an image
    missing or older than the pinned versions, or a missing Keychain token
    stops the launch with a message saying which host step fixes it; nothing
    falls back to the Mac. `just doctor` warns before the Claude token's
    yearly expiry. Source: the current Pi sandbox's fail-closed startup and
    the earlier plan's contract. 2026-11-01.

### Per agent

- **W-16 Pi's shape.** Whole Pi inside the VM, or host Pi with its tools in the
  VM? Do `!` commands run in the VM or on the host?
  - Known: Pi's isolation guide compares both. Host routing keeps extensions on
    the host. Pi's Gondolin example routes `!` into the VM; the old setup kept
    `!` on the host.
  - Answer: Pi runs on the Mac; its built-in tools run in the VM. Source: Pi's
    Gondolin example and the pre-October setup. Pi uses ChatGPT sign-in, whose
    token refresh returns real tokens, so keeping Pi on the host is the only
    referenced pattern that keeps them out of the guest; host integrations keep
    working. 2026-11-01.
  - Answer: `!` and `!!` stay on the Mac. Source: the pre-October setup (Pi's
    Gondolin example routes them into the VM instead). They are the user's
    deliberate host route for pushes, Brew, Rex, Just, and VPN. 2026-11-01.
- **W-17 Pi pruning.** Which extensions and built-ins still earn their place
  once the VM is the boundary?
  - Current extensions: answer, caffeinate, clipboard-image, exit, review,
    review-summary, sandbox (native), tldraw, uv, wal-writer. Built-ins:
    codemode, mcp, llama.cpp, tool-search.
  - Answer: drop `sandbox` (replaced by Gondolin), `uv` (its guard protects
    nothing inside the VM), and `wal-writer` (unused). Keep answer,
    caffeinate, clipboard-image (VM tools can't read host temp files), exit,
    review, review-summary, and tldraw. Source: user choice after reviewing
    each extension's purpose. 2026-11-01.
  - Answer: turn off the `mcp` built-in (no MCP use case; its servers run in
    host Pi outside the VM). Keep codemode, llama.cpp, and tool-search.
    Source: user choice; earlier plan's PI-04. 2026-11-01.
- **W-18 Claude and Amp settings.** Which settings differ inside the VM
  (permissions, sandbox, hooks, status line, notifications, keys), and how is
  it obvious that a session runs in the VM?
  - Known: host Claude settings require the macOS Bash sandbox and run Rex and
    Herdr hooks that need host sockets. The `gondolin` CLI uses `Ctrl-]` to
    force-close a session, which Claude Code also binds; the SDK's `vm.exec`
    can attach a terminal directly. Claude Code's devcontainer docs confirm it
    rejects `--dangerously-skip-permissions` as root and use a non-root user.
  - Known: Amp settings live in `~/.config/amp/settings.json` on Linux, with
    workspace settings in `.amp/settings.json`. Its docs pages checked so far
    don't name a flag that skips permission prompts; check `amp --help`.
  - Known: Claude's devcontainer docs persist a writable `~/.claude` volume;
    Docker Sandboxes ignores user-level `~/.claude` and uses only project
    settings.
  - Answer: since Claude never runs on the Mac, telling sessions apart is moot.
    VM settings are tracked in this repo (the `claude/` package rewritten for
    the VM, plus an Amp settings file) and mounted read-only; history and
    other runtime state go in a separate per-agent state folder on the Mac
    (W-14). Source: this repo's tracked-config convention (AGENTS.md); Claude
    Code's sandbox also keeps agents from rewriting their own settings.
    2026-11-01.
- **W-19 Local VM or vendor cloud.** When is the local VM better than Claude
  Code's cloud environments (already set up) or Amp's cloud executor?
  - Known: `amp --executor local` runs Amp's tools on the machine it starts on
    rather than in an Amp cloud orb; model inference still uses Amp's service.
  - Known: the Claude desktop app (in the Brewfile) can run Claude Code
    sessions on the Mac, outside the VM.
  - Answer: keep vendor clouds (Claude Code on the web, Amp's cloud executor)
    as a complement for phone, web, and long unattended work; they never run
    on the Mac. Gondolin covers everything local. Source: user choice;
    Claude's cloud keeps GitHub credentials in its proxy. 2026-11-01.
  - Answer: keep the Claude desktop app for chat; find a setting that turns
    off its local Code sessions, and remove the app if there is none. Source:
    user requirement that agents never run on the Mac. 2026-11-01.

### Boundary

- **W-20 VM-written files that the Mac runs.** How are files a VM agent writes
  kept from running on the Mac: project `.pi/` (host Pi), `.claude/` (host
  Claude), and `.git/hooks` and `.git/config` (host Git)?
  - Known: Claude Code's own sandbox denies writes to project
    `.claude/settings*.json`, `.claude/hooks`, and `.claude/skills` inside an
    otherwise writable workspace. Gondolin can deny writes to chosen paths in a
    mount (the old setup did this for `_models/`). Pi's project trust is per
    directory, not per content.
  - Answer: make those paths read-only inside the VM; everything else stays
    writable, including this repo's `pi/` and `claude/` packages. Git commands
    in the VM that write `.git/config` (for example, setting an upstream) will
    fail. Source: Claude Code's sandbox write protections. 2026-11-01.

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
- Host Pi loads project `.pi/extensions`, `.pi/mcp.json`, and
  `.pi/settings.json` from any trusted folder. Trust is saved per directory
  (and its parents) in `~/.pi/agent/trust.json`, not per content, so files a
  VM agent writes there run in host Pi at the next start or `/reload`. Host
  Claude has the same exposure through project `.claude/` settings and hooks.
  W-20 makes these paths read-only in the VM.
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

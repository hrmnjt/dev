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

**2026-11-09: candidate implementation, not deployed or host-accepted.** Source
work and fixture checks are distinguished below from live behavior. Do not merge
or retire this tracker until the user completes the host acceptance in
[gondolin/README.md](gondolin/README.md#checks-and-remaining-acceptance).
The user installed Podman 6.1.4 and initialized/started its machine with branch
config; basic engine connectivity is verified. The first image build failed at
Amp's assumed CLI-flag check. After correcting it to use the documented
`amp.dangerouslyAllowAll` setting, the user successfully built image
`3ae12ee30b3fd9705b9f2894b951a443cad6cff019376c37d9274a2e463ab7a1`.
Read-only inspection confirms its completion marker matches the current source
fingerprint and its manifest is present. No Stow/live npm operation,
Keychain/login, GitHub setting, Mac agent removal, push or merge has been
performed. The first live fixture booted far enough to read the guest image
marker, then failed a bindfs re-export command before non-root/enforcement checks.
The rerun with diagnostics showed libfuse 2 refusing Gondolin's non-empty bind
targets; bindfs now uses `nonempty`. The rebuilt image (`cc0189b33c067e3a`)
then passed bindfs, non-root access, write-denial probes, live worktree/Git
config writes, fail-closed identity, protected-path denials (bash and root
`vm.fs`) and protected-ancestor moves, but `sudo` lacked its setuid bit. Image
inputs changed again (recorded special modes), so rebuild before rerunning.
Successful VM enforcement and real-agent acceptance remain pending.

### 1. Prepare

- [x] Implementation uses `feat/gondolin/sandbox-for-all` in the supplied
  `dev-feat-gondolin-sandbox-for-all` worktree; initial status was clean.
- [~] Record a host baseline (W-04). Initially observed: Pi 1.4.0, Node 26.13.0,
  QEMU 11.1.3; no deployed Gondolin, Docker or Podman. Branch-local Gondolin
  dependencies are pinned to 0.14.0. Repository-only doctor before and after:
  **12 passed, 0 failed, 1 warning** (Python TOML validator unavailable).
  Full deployment doctor, VM boot/RSS and parallel-agent sizing remain pending.
  The candidate's 4 GiB/2 CPUs is provisional, not a measured budget.
- [x] Branch-only entry points documented: `trial-pi`, direct branch
  `cli.mjs claude|amp`, and Rex `REX_CONFIG` / `rex do <file> --action`.
  No server reload or deployment is needed; real agent trials await live VM
  enforcement checks and credential setup.
- [ ] Walk through a working day with each agent and confirm it with the user.

### 2. Shared Gondolin setup

- [x] User installed Podman 6.1.4 for image builds (host step, W-01).
  Intentional machine defaults now live in `podman/`; generated state/auth are
  excluded. User initialized `podman-machine-default` with `CONTAINERS_CONF`.
  Read-only definition inspection confirms AppleHV, 9 vCPUs, 2048 MiB RAM,
  100 GiB virtual disk capacity, rootless mode and an empty host-share list.
  User started the machine; `podman info` confirms a 6.1.4 Linux/arm64 rootless
  engine. Image-build prerequisites are available. No Docker API helper or
  `DOCKER_HOST` override was needed. Runtime mount/workload checks remain pending.
  Podman's inspection CLI needs a host lockfile, so configuration inspection
  used the saved definition only. No Stow deployment from the worktree.
- [x] Fingerprinted Debian/Alpine image pins Node, Claude, Amp,
  Playwright/Chromium and Gondolin; user build completed with version/help
  assertions passing (W-01). Completion marker matches the current source.
  This proves image construction, not VM boot, enforcement or authentication.
- [x] Shared `gondolin/` package centralizes mounts, network, host-scoped
  Keychain placeholders, fail-closed identity and canonical common-Git-dir
  selection (W-02, W-05, W-08). Real VFS/HTTP-hook fixtures pass.
- [~] Read-only paths/global Git config have provider, alias, hardlink and
  protected-ancestor fixture coverage (W-20). On 2026-11-09 the live fixture
  confirmed non-root bindfs access and denied writes/moves for `.pi`, `.claude`,
  common hooks, guest Git config and `/pi-output`, through bash and root
  `vm.fs`. Root-via-`sudo` denials and the rest of the fixture are still pending.
  Keep the accepted writable `.git/config` execution risk.
- [ ] Claude, Amp and GitHub tokens in Keychain (W-02, W-12); services, expiry
  metadata and token acquisition are documented, not provisioned.
- [~] One labelled VM/session, explicit image, no host fallback, failure
  messages, cancellation and cleanup are implemented/tested with fake VM
  transports (W-04, W-09, W-15). Real list/attach/boot/exit remain pending.
- [ ] GitHub ruleset on `main` for each repo agents push to; confirm private
  repository support/enforcement on the current plan (W-12).

### 3. Pi

- [~] Host Pi interface/model auth with VM-only read/write/edit/bash,
  nested/codemode delegation and unchanged host `!`/`!!` are implemented
  and SDK-fixture-tested (W-16). Real VM, reload, retained UI commands and
  tldraw interaction remain pending.
- [~] SDK-owned host Bash overflow logs get a private read-only `/pi-output`
  mount; model/codemode paths and successful cleanup have real-SDK coverage.
  Actual Pi-over-VM reads, timeout/abort and reload need host verification.
- [x] Retired `sandbox`, `uv`, `wal-writer` and native-only tests;
  disabled MCP. The explicit launcher keeps only the agreed extension set.
  Existing model/thinking/theme/tool settings are preserved (W-17).
- [x] Tests and doctor source match the candidate; expiry warnings and
  missing/stale setup diagnostics are included. See evidence below.

### 4. Claude Code

- [~] UID 1000 entry point, bypass mode, nested sandbox/update controls,
  read-only VM-only settings and mutable history separation are implemented
  (W-18). Gondolin sandboxfs needs the candidate bindfs ownership remapping;
  the first live attempt failed during bindfs setup before non-root probes
  (non-empty mountpoint, now mounted with `nonempty`). This remains a
  deployment blocker until the rebuilt image passes the live fixture. Claude
  state is seeded past onboarding, the bypass prompt is skipped by setting, and
  the agent user has passwordless guest `sudo`.
- [x] Rex action/shortcut and typed `claude` route through the shared
  launcher; mocked wiring and branch Rex config checks pass (W-03).
- [~] Direct PTY/terminal metadata should preserve OSC 7501; removed host
  command hooks and tmux/CLI escape interception. Real status pending (W-06).
- [~] Images-only bounded/random-route clipboard proxy and guest adapters
  have transport tests; actual Ctrl+V detection/decoding pending (W-07).
- [~] Opt-in loopback ingress and pinned Playwright are implemented;
  actual preview/browser use pending (W-10).
- [~] HTTPS rewrite/helper and selected-repo identity are implemented;
  actual authenticated commit/push/PR plus ruleset refusal pending (W-12).
- [~] Per-primary-project state is implemented; actual history/memory across
  worktrees, parallel sessions and restart pending (W-14).
- [~] Mac-only package settings were repurposed into VM-only config, so legacy
  Mac Claude cannot inherit bypass mode. Actual Mac install removal awaits
  VM acceptance and is a user operation (W-03).
- [ ] Remove desktop app after acceptance: no documented reliable setting to
  disable every local Code session was found. Candidate Brewfile omits both
  Claude casks and Codex; installed apps remain untouched and doctor warns
  while they remain (W-19).
- [-] Remote Control push notifications: Claude requires a full-scope login
  token, and `setup-token` tokens are inference-only (W-02). Use Claude Code on
  the web for phone/remote work (W-19).

### 5. Amp

- [~] `@ampcode/cli` is pinned and the image build passed its version/interface
  checks. `sgamp_` Keychain placeholder flow is implemented; real sign-in is
  unverified (W-01/02).
- [~] The pinned binary's actual `--help` confirms the
  `amp.dangerouslyAllowAll` setting, not the assumed CLI flag. VM-only read-only
  settings now enable it; the launcher passes only `--settings-file` plus user
  arguments. Build checks require both advertised interfaces and print failures.
  Rebuild passed; real prompt-free behavior remains pending (W-18).
- [x] Rex action/shortcut and typed `amp` route through the same launcher;
  mocked wiring and branch Rex config checks pass (W-03).
- [~] `AMP_FORCE_BEL=1` and notification settings are supplied; real
  done/blocked bell behavior pending (W-06).
- [~] Shared image-paste/preview/Git/state plumbing is implemented; actual
  Playwright, pushes/PRs and per-project history pending, as for Claude.

### 6. Ship

- [x] Updated package READMEs, root setup/changelog, AGENTS.md execution
  environment and related Git/Rex/Zsh/theme/local-model/Herdr documentation.
  Lasting operational instructions live in package guides.
- [ ] Merge only after host acceptance; the user deploys from the primary
  checkout (Stow, npm, image, reload) and verifies on the host.
- [~] Retain this file for pending acceptance; retire it once the live
  evidence and deliberate host steps are complete.

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
- Rex can validate a branch with `REX_CONFIG=<branch-init.lua> rex
  --autostart=false config check`, and execute a file's actions with `rex do`.
  This does not reload/bind the branch config; see the shared package guide.
- Merging is deploying. After pulling `main`, new sessions see changed files at
  once; new files need `just stowall` from `main`; deleted files leave broken
  links until restowed; running Pi sessions keep old code until `/reload`.

## Verification evidence

- 2026-11-09, inside the Claude Code sandbox with a scratch Pi 1.4.0 SDK and a
  symlinked `TMPDIR`: **80 tests, 75 passed, 1 skipped, 4 failed**. The failures
  are sandbox limits only: three clipboard tests cannot bind a local port, and one
  Pi test hits the SDK's host `realpath` on `/home` (unreadable there; ENOENT on
  the Mac). The clipboard adapter was checked separately with a stubbed fetch.
  Rex config check passes (7 actions, 7 bindings); the Rex fixture needs the Rex
  socket and was not run.
- Node VM/Pi suites (2026-11-08): **78 tests, 77 passed, 1 skipped, 0 failed**. They use
  synthetic tokens, real VFS/HTTP hooks, the installed Pi SDK, fake VM transports
  and disposable Git projects. Includes bounded guest
  reads, image handling, startup/shutdown races, SDK overflow serialization,
  settings preservation and Stow-prefix dependency resolution. Added coverage
  for Amp's setting-vs-flag interface, diagnostic CLI failures/version mismatches,
  and bypass-enabled settings delivered only through a read-only VM provider.
  Startup-failure fixtures also verify stage/status diagnostics, escaped controls,
  cleanup and credential/placeholder redaction before output truncation.
- Podman config TOML, Git exclusions and Stow simulation pass. With the installed
  Python 3.14 explicitly selected for TOML validation, repository doctor reports
  **13 passed, 0 failed, 0 warnings**. No Podman machine was created or started.
- Strict TypeScript check of the current Pi extensions against Pi 1.4.0 passes.
- Rex branch config: **7 actions, 7 bindings**. Mocked regression suite:
  **58 lifecycle cases, 6 refused contexts**, plus agent wiring assertions.
- Disposable shell fixtures: **11 repository doctor**, **7 Stow diagnostic**,
  **8 SSH setup** checks pass. A separate Stow simulation checks npm state
  stays out of deployment; no links are created.
- The live QEMU test is opt-in and skipped here. No container runtime/image
  was available; fixtures are not evidence of FUSE/kernel isolation or real
  authentication, clipboard/terminal/browser behavior.
- Before acceptance, run the opt-in VM fixture, all three real agent day-in-
  the-life trials and full doctor from a host terminal. Record boot/RSS,
  parallel sizing, authenticated Git/PR/rulesets, image paste, status/bells,
  preview/Playwright, history/memory and Pi overflow/codemode/reload/UI results.
  The command sequence is in the shared package README.

## Notes

- 2026-11-07: User image build failed at the old `--dangerously-allow-all`
  help grep. A network-disabled run of the cached Linux image returned help
  successfully and advertised `amp.dangerouslyAllowAll` in settings. Source
  now uses that setting in VM-only config, with a diagnostic build verifier.
  CLI-help evidence does not prove authenticated prompt-free agent behavior.
  The subsequent user rebuild completed for fingerprint `3ae12ee30b3fd970`;
  marker/manifest inspection passed.
- 2026-11-08: The user ran the opt-in live QEMU fixture. Guest image-marker
  reading succeeded, but bindfs setup returned nonzero; the original error
  discarded stderr, so no root cause is established. Startup errors now include
  the stage, exit status and bounded/escaped/redacted command output. No image
  inputs changed; rerun the fixture without rebuilding. Enforcement is unproven.
- 2026-11-09: The diagnostic rerun failed at `bindfs /pi-output` with libfuse 2's
  "mountpoint is not empty": Gondolin bind-mounts every VFS mount before bindfs
  runs. bindfs now passes `nonempty`. Verified against the installed Gondolin
  SDK, the Pi 1.4.0 package and the Mac's Claude Code 2.1.311 binary (the image
  pins 2.1.316): option names, attach raw mode/resize, symlink
  handling for the state links, Pi CLI flags/`PI_CODING_AGENT_SESSION_DIR`, Pi's
  in-place `auth.json` writes (lock lives beside the trial link), Claude's
  `skipDangerousModePermissionPrompt`/`hasCompletedOnboarding` keys and its
  full-scope requirement for Remote Control. Pi's write tool still calls host
  `realpath` on guest paths to key its mutation queue (SDK behaviour, metadata only).
- 2026-11-09 (second run, image `cc0189b33c067e3a`): everything up to the new
  `sudo` assertion passed; `sudo -n id -u` failed. Gondolin extracts the OCI
  export with macOS `tar -xf` as non-root, which drops setuid/setgid/sticky bits
  and applies the umask; its debugfs fix-up restores only uid/gid. The root is
  not `nosuid` and sandboxd sets no no-new-privs. The image now records such
  modes and launch restores them. Gondolin's default tmpfs set also hid
  `/var/cache`/`/var/log` (apt archives, debconf), so only `/tmp`, `/var/tmp` and
  `/root` stay tmpfs. The host Pi SDK suites could not find a Node SDK; the
  locator now accepts a disposable `_scratch/pi-sdk` copy. Rebuild, then rerun.

- 2026-11-02: Gondolin 0.14.0's sandboxfs is root-only (guest source). The
  candidate image uses bindfs to re-export the same guarded providers for UID
  1000 and probes access/denials before launch; live behavior is still pending.
  `@ampcode/cli` is the current npm package, not the redirecting
  `@sourcegraph/amp`. Stow `--no-folding` requires dependency resolution
  from the real install prefix, plus an ignore rule for branch node_modules.
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

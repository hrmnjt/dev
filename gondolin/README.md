# Agent VMs

One shared Gondolin policy for Pi, Claude Code and Amp. **This is a candidate
migration; successful image construction alone is not host acceptance.** Nothing
installs, logs in, rebuilds, deploys, or changes GitHub settings automatically.

## Layout

- Pi's interface, model connection and OAuth refresh run on the Mac. Its model
  `read`, `write`, `edit` and `bash` tools run in one VM per Pi session, including
  nested/codemode calls. User `!`/`!!`, review UI, clipboard attachments and the
  deliberately narrow tldraw bridge remain host integrations.
- `claude` and `amp` are **launchers**, not Mac agent installations. Each launches
  one disposable VM and attaches the terminal directly, with no tmux or Gondolin
  CLI `Ctrl-]` escape interception. Claude starts as UID 1000 with permission
  prompts bypassed; Amp uses `amp.dangerouslyAllowAll` in read-only VM settings.
- Every VM uses the explicit fingerprinted image, QEMU, 2 CPUs and a provisional
  **4 GiB** memory budget. Measure boot/RSS and parallel sessions on the Mac before
  accepting that budget; it is not a measured baseline.
- The complete worktree is mounted at its canonical Mac path. Launching in a
  subdirectory keeps that cwd but exposes the whole worktree. A linked worktree's
  common Git directory is mounted at the same absolute path, not primary source.
  Normal Git commits, upstream updates and branch pushes are possible.
- Mac home/config/credential directories are never mounted. Launching from the
  Mac home, its ancestor, or its credential/config directories is refused.

The Stow package supplies `~/.config/gondolin/` and `~/.local/bin/{agent-vm,pi,
claude,amp,gondolin}`. Zsh functions and Rex actions use the launcher explicitly
so an old Mac binary cannot win PATH. The host Pi executable is expected at
`~/.pi/agent/bin/pi` (the current Pi installer location). `.stow-local-ignore`
keeps branch-local `node_modules` out of deployment. SDK resolution uses the
chosen installation prefix, not the canonical Stow source path; `npm ci` writes
dependencies in the real deployed directory.

## Try this branch without deploying

Run these commands yourself in a **host terminal** in the implementation worktree.
Do not Stow from a worktree or install dependencies into live Pi to try the branch.
For Podman, first follow the [tracked Podman configuration](../podman/README.md#try-the-branch-without-deploying)
to select the branch config and initialize/start its machine in that terminal.

```bash
config="$PWD/gondolin/.config/gondolin"
# Branch-local dependencies only, not ~/.pi/agent or the deployed shared package:
npm ci --prefix "$config"
# Install Podman from Brewfile, then initialize/start its machine deliberately.
# Docker is also supported; Apple's container is not.
node "$config/cli.mjs" build podman     # or: build docker
node "$config/cli.mjs" trial-pi
node "$config/cli.mjs" claude
node "$config/cli.mjs" amp
```

`trial-pi` uses a mode-0700 temporary agent directory with branch settings/themes,
explicit branch extensions and the three retained built-ins. Discovered extensions
(including the deployed native backend), project extensions, MCP and skills are
not loaded. Host auth is linked, not mounted in the VM; Pi may refresh its existing
host login. The temporary directory is removed on exit. Normal `pi` also selects
only the reviewed extension set explicitly, but preserves host settings/skills.
Both use per-primary-project Pi session storage.

Rex can check a file or invoke an action from it **without reloading server config**:

```bash
REX_CONFIG="$PWD/rex/.config/rex/init.lua" rex --autostart=false config check
# From a Rex shell in the target worktree; this deliberately opens one agent pane:
AGENT_VM_CONFIG="$config" rex --autostart=false do \
  "$PWD/rex/.config/rex/init.lua" --action agent_claude \
  -s "$REX_SESSION" -b "$REX_BLOCK"
```

Use `agent_pi` (normal host settings), or `agent_amp` for the other actions; use
`trial-pi` directly for a fully isolated Pi configuration trial. This does not
bind new keys or reload live Rex. See [Rex](../rex/README.md) for normal shortcuts.

## Host credentials

Use **Keychain Access → login keychain → New Password Item**. The account is your
Mac short username (`id -un`); the item name/service is the exact value below.
Never place tokens in shell arguments, repository files, guest login files,
image build arguments, or environment exports.

| Service/item | Password value | Used for |
| --- | --- | --- |
| `dev.agent-vm.claude` | `sk-ant-oat01-…` from `claude setup-token` | `api.anthropic.com` only |
| `dev.agent-vm.claude-expires` | token expiry as `YYYY-MM-DD` | doctor renewal warning, 30 days ahead |
| `dev.agent-vm.amp` | `sgamp_…` access token from Amp account settings | `ampcode.com` only |
| `dev.agent-vm.github` | `github_pat_…` fine-grained token | `github.com`, `api.github.com` only |

Before deployment use `node "$config/cli.mjs" claude setup-token`. After deployment
use `claude setup-token`. This one explicit setup command runs in a throwaway VM
with **no mounts, state, clipboard proxy or supplied credentials**. Open the URL
on the Mac yourself and complete its flow; transfer the resulting token straight
into Keychain Access. Record its actual reported expiry (normally one year),
then discard terminal output. Do not use `claude login`/`amp login` inside a work
VM. Amp's token comes from its web UI, not a guest login.

The host reads Keychain only at launch. Gondolin issues fresh token-shaped
placeholders and substitutes them on outbound HTTP headers/Basic auth only for
the exact hosts above; redirected real credentials are also host-checked. No SSH
agent, arbitrary host environment, provider keys, proxies, or Rex RPC socket are
forwarded. Pi's existing provider authentication remains in Pi's host-managed
auth storage; this migration does not move or reset it.

Grant the GitHub token **Contents: write** and **Pull requests: write**, scoped to
chosen repositories. Configure an active ruleset on `main`: require PRs and
block deletion and force pushes **without an owner/admin bypass**. Verify private
repository ruleset support on the current GitHub plan; do not assume a configured
but unenforced ruleset is protection. These are user GitHub steps, never automatic.
Git's `git@github.com:` and `ssh://git@github.com/` remotes are rewritten to HTTPS;
the helper and guest `gh` use the same placeholder. Other SSH hosts are not bridged.
No credentials need to be saved by guest `gh auth login`.

## Boundaries and persistence

Read-only host-backed paths: every `.pi` and `.claude` tree, common/worktree Git
hooks, tracked agent configuration and the guest's global Git configuration.
The provider rejects writes through aliases/hardlinks and destructive moves of
protected ancestors. `_models` is unavailable when under the worktree. Guest
home `.pi`/`.claude` are read-only empty mounts. Global Git config is generated
from only the selected personal/work name/email, not host helpers or includes.
Unknown primary paths have no identity; Git uses `user.useConfigOnly=true`.
Linked worktrees select identity using their primary common directory.

`.git/config` deliberately remains writable. **This is a known host-execution
risk**, not an untrusted-checkout boundary: an agent can set `core.hooksPath` (or
other executable Git configuration) to writable code that host Git later runs.
Likewise, most other worktree files are live Stow source in the main `dev`
checkout. Review/merge feature branches; do not run unattended there. Read-only
checks are host provider enforcement, not merely agent instructions. Ordinary
worktree files, including untracked `.env` files, are still readable. Known host
Pi/Claude auth files are hidden if a legacy folded Stow layout puts them inside
the selected checkout; do not store other host credentials in a workspace.

Gondolin 0.14's `sandboxfs` mount is root-only. The pinned image includes `bindfs`,
which re-exports the **same guarded providers**, remapping file ownership to UID
1000 so non-root Claude can read/write them. It exposes no additional host path.
Startup checks non-root workspace/home access and attempts denied writes before
starting an agent. Failure stops launch; there is no native/unsandboxed fallback.
Real FUSE behavior still needs the opt-in host test below.

State is under `~/.local/state/agent-vm/<primary-hash>/<agent>/`:

- `home/` is the only mutable guest-home mount, shared by that project's worktrees.
- For Pi, `sessions/` contains host UI history and is **not** mounted in the VM.
- Claude uses `home/claude-state/` for history/memory; tracked settings are served
  read-only through `/etc/agent-config`, including managed settings and personal
  instructions/themes. This separates mutable runtime state from `.claude` config.
- Amp uses its ordinary home/XDG data directories and a read-only settings file
  sourced from `.config/agent-vm/amp/`, not the Mac CLI's default config path.
- All other root-disk changes are discarded on exit. Parallel sessions have
  separate VMs but intentionally share their project's agent history/memory.

Public HTTP(S) internet access follows Gondolin's default policy. Internal/private
IP destinations and Mac services are blocked, with only the images-only clipboard
proxy mapped for Claude/Amp. No general project service mapping exists yet. The
proxy accepts only a fixed random GET route returning bounded PNG bytes from
AppKit; no text, file-path, upload or arbitrary-command endpoint. It cannot stop
an agent reading the clipboard image while its session is running, so avoid
copying private images during an untrusted session. Pi keeps its own attachment
extension instead. Real CLI image-paste detection remains a host acceptance check.

## Daily use

```bash
pi                            # host UI, VM model tools
claude                        # non-root, no approval prompts
amp                           # no approval prompts; terminal bell for done/blocked
claude --preview 3000          # opt-in HTTP ingress to guest localhost:3000
amp --preview 5173            # use -- before subsequent agent flags if needed
# No preview ports are published by default or by the Rex shortcuts.
gondolin list
gondolin attach <session-id>
agent-vm doctor
```

Ingress binds **host loopback only** on an ephemeral port, printed at launch.
The image has pinned Playwright/Chromium for guest-side screenshots/tests. Install
project dependencies in the worktree/home normally; host Brew and image changes
remain deliberate user operations. Claude/Pi terminal OSC 7501 reaches Rex
without a tmux wrapper. Amp uses `AMP_FORCE_BEL=1`; an OSC adapter is deferred.
Cloud Claude/Amp executors remain complements, not part of this local launcher.

## Build, upgrade, deploy

Pins live in `pins.json`: Gondolin 0.14.0, a digest-pinned Debian Node image,
Claude Code 2.1.316, `@ampcode/cli` 0.0.1793548828-ge47c64 and Playwright 1.64.1.
The build verifier checks installed versions and requires `amp --help` to
advertise `amp.dangerouslyAllowAll` and `--settings-file`; it does not assume a
CLI bypass flag. Command failures include status/output, and missing interfaces
fail with the captured help. The verifier is part of the image fingerprint.
Auto-update is disabled.
The Alpine kernel/boot layer is separate from the Debian OCI root filesystem.

Build prerequisites: Node 24+, QEMU, Docker or Podman, `lz4`, `e2fsprogs` and
macOS `cpio` (Brewfile tracks Podman and the other non-system prerequisites).
Installing Podman does not initialize or start its Mac machine; those remain
explicit user steps. The [Podman package](../podman/README.md) tracks general
machine defaults separately from generated state and registry credentials.
Images are kept at
`~/.local/share/agent-vm/images/<fingerprint>/`. A missing/stale marker or a
mismatched guest marker stops launch and names `agent-vm build`. No default image
is downloaded as a fallback. Bump pins, update the lockfile if Gondolin changes,
rebuild and repeat host acceptance. Old images are not deleted automatically.

After branch acceptance, merge deliberately, quit running agents, and deploy
**from the primary checkout**, following [Pi migration](../pi/README.md#deploy).
Stow links are live source, not copies; do not merge/deploy a candidate whose
VM tests have not passed. Remove Mac Claude Code and the Claude desktop app only
after the VM workflow is accepted; see [Claude](../claude/README.md).

## Checks and remaining acceptance

Branch-local fixture tests after installing the shared dependencies:

```bash
node --test _tests/gondolin/*.test.mjs _tests/pi/*.test.mjs
./_scripts/tests/rex-worktrees.sh
./_scripts/tests/doctor-stow.sh
./_scripts/tests/doctor-repository.sh
./_scripts/tests/sshsetup.sh
just doctor --only-check
```

Set `PI_TEST_SDK_ROOT` to the installed Pi package directory when outside the
Homebrew default. Unit tests use real VFS providers and HTTP substitution hooks,
synthetic tokens, fake VM transports, isolated Git repositories and synthetic
clipboard images. They do **not** prove kernel isolation, CLI authentication,
host clipboard/CLI image-paste compatibility, or live agent/TUI behavior.

After building, run in an unsandboxed **host terminal**, never nested in Pi's
currently loaded native sandbox:

```bash
AGENT_VM_LIVE_TEST=1 node --test _tests/gondolin/live.test.mjs
agent-vm doctor
just doctor --verbose
```

Initialization failures identify the setup step and exit status, with bounded,
escaped stdout/stderr and known credential/placeholder values redacted. They do
not dump environments or SDK requests. Diagnose mount/FUSE failures before
assuming an image rebuild will fix them; launch still stops without host fallback.

The live fixture uses synthetic tokens and disposable repos only, with no
upstream pushes. A successful build is not host acceptance: verify
bindfs/non-root/mount probes; boot/RSS/parallel-session budget; all three
day-in-the-life trials; Claude/Amp
real sign-in placeholders, Ctrl+V, terminal status/bell, preview/Playwright,
commit/push/PR and restart/history/memory; Pi overflow through real VM reads,
codemode, review/answer/tldraw and reload/shutdown; ruleset enforcement and Mac
agent retirement. Keep these pending in `TODO.md` until observed, then retire the
planning file, not the acceptance checks.

References: [Pi containerization/example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/gondolin),
[Gondolin custom images/networking](https://earendil-works.github.io/gondolin/),
[bindfs ownership mapping](https://bindfs.org/docs/bindfs.1.html),
[Claude devcontainer](https://code.claude.com/docs/en/devcontainer),
[Amp CLI/settings](https://ampcode.com/docs/cli/settings).

# Agent VMs

One shared Gondolin policy for Pi and Claude Code. **This is a candidate
migration; successful image construction alone is not host acceptance.** Nothing
installs, logs in, rebuilds, deploys, or changes GitHub settings automatically.

## Layout

- Pi's interface, model connection and OAuth refresh run on the Mac. Its model
  `read`, `write`, `edit` and `bash` tools run in one VM per Pi session, including
  nested/codemode calls. User `!`/`!!`, review UI, clipboard attachments and the
  deliberately narrow tldraw bridge remain host integrations.
- Typed `claude` is a **VM launcher**; the Mac CLI keeps its own settings. Each
  launch starts one disposable VM and attaches the terminal directly, with no tmux
  or Gondolin CLI `Ctrl-]` escape interception. Claude starts as UID 1000 with permission
  prompts bypassed.
- Amp is not supported for now. A VM trial worked except image upload
  (`EPROTO` TLS handshake failure), and its server refuses CLIs more than a few
  days old, forcing frequent rebuilds; see the `TODO.md` notes before retrying.
- Every VM uses the explicit fingerprinted image, QEMU, 2 CPUs, a provisional
  **4 GiB** memory budget and a **16 GiB** root disk. Measure boot/RSS and parallel
  sessions on the Mac before accepting that budget; it is not a measured baseline.
- The complete worktree is mounted at its canonical Mac path. Launching in a
  subdirectory keeps that cwd but exposes the whole worktree. A linked worktree's
  common Git directory is mounted at the same absolute path, not primary source.
  Normal Git commits, upstream updates and branch pushes are possible.
- Mac home/config/credential directories are never mounted. Launching from the
  Mac home, its ancestor, or its credential/config directories is refused.

The Stow package supplies `~/.config/gondolin/` and
`~/.local/bin/{agent-vm,claude,gondolin}`. The `claude` zsh function uses the
VM launcher explicitly so an old Mac binary cannot win PATH. Pi has no
launcher: its installer owns `pi` on PATH, and Pi auto-discovers the global
Gondolin extension. `.stow-local-ignore`
keeps branch-local `node_modules` out of deployment. SDK resolution uses the
chosen installation prefix, not the canonical Stow source path; `npm ci` writes
dependencies in the real deployed directory.

## Try this branch without deploying

Run these commands yourself in a **host terminal** in the implementation worktree.
Do not Stow from a worktree or install dependencies into live Pi to try the branch.
Start a Docker or Podman engine first; Apple's `container` cannot build the image.

```bash
config="$PWD/gondolin/.config/gondolin"
# Branch-local dependencies only, not ~/.pi/agent or the deployed shared package:
npm ci --prefix "$config"
node "$config/cli.mjs" build podman     # or: build docker
node "$config/cli.mjs" claude
```

To try **Pi** with the branch extensions, use a temporary profile that
auto-discovers them the way deployed Pi does. Run this from the same shell,
after preparing `config` and the image above:

```bash
(
  set -eu
  profile=$(mktemp -d "${TMPDIR:-/tmp}/pi-discovery.XXXXXX")
  trap 'rm -r -- "$profile"' EXIT
  agent="$PWD/pi/.pi/agent"
  cp "$agent/settings.template.json" "$profile/settings.json"
  mkdir "$profile/extensions"
  for extension in "$agent"/extensions/*.ts; do
    ln -s "$extension" "$profile/extensions/${extension##*/}"
  done
  ln -s "$agent/themes" "$profile/themes"
  AGENT_VM_CONFIG="$config" PI_CODING_AGENT_DIR="$profile" \
    PI_CODING_AGENT_SESSION_DIR="$profile/sessions" "$HOME/.pi/agent/bin/pi" --no-approve
)
```

Check that the footer shows `VM <id>`, then quit without sending a model
prompt. The profile has no host auth, settings, skills or other global
extensions, and `--no-approve` skips project-local resources. It's removed on
exit.

## Host credentials

Use **Keychain Access → login keychain → New Password Item**. The account is your
Mac short username (`id -un`); the item name/service is the exact value below.
Never place tokens in shell arguments, repository files, guest login files,
image build arguments, or environment exports.

| Service/item | Password value | Used for |
| --- | --- | --- |
| `dev.agent-vm.claude` | `sk-ant-oat01-…` from `claude setup-token` | `api.anthropic.com` only |
| `dev.agent-vm.claude-expires` | token expiry as `YYYY-MM-DD` | doctor renewal warning, 30 days ahead |
| `dev.agent-vm.github` | `github_pat_…` fine-grained token | `github.com`, `api.github.com` only |

Every launch, including `pi`, requires the GitHub item, plus Claude's own
item for Claude. A missing item stops launch with the item name (no
fallback), so add them before the first launch after deployment.

Before deployment use `node "$config/cli.mjs" claude setup-token`. After deployment
use `claude setup-token`. This one explicit setup command runs in a throwaway VM
with **no host mounts, state, clipboard proxy or supplied credentials**; only
Gondolin's read-only TLS interception CA is mounted. Open the URL
on the Mac yourself and complete its flow; transfer the resulting token straight
into Keychain Access. Record its actual reported expiry (normally one year),
then discard terminal output. Do not use `claude login` inside a work
VM.

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
It mirrors the tracked host settings (rerere, `zdiff3`, branch sort, pull/fetch)
and serves the host global excludes read-only, so guest `git add -A` skips the
same editor swap and Claude scratch files as host Git.
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

Agents run as `agent` (UID 1000) with passwordless `sudo` for guest packages
and system changes. Pi's write/edit tools use the same user as Bash. The image's
`bindfs` layer remaps ownership over the same guarded mounts; it exposes no
additional host paths. Startup probes non-root access and write denials before
starting an agent. Failure stops launch.

Root in the VM gains no host access: the provider enforces protected/hidden
paths and credentials remain placeholders. The root disk is a per-session
copy-on-write layer over the image, grown to `disk` in `config.json` and resized
in the guest at boot, then discarded on exit. The layer is sparse: the Mac stores
only what the guest writes, in its temporary directory. Only `/tmp`, `/var/tmp`
and `/root` are tmpfs, limited by VM memory rather than `disk`; apt state remains
on disk.

State is under `~/.local/state/agent-vm/<primary-hash>/<agent>/`:

- `home/` is the only mutable guest-home mount, shared by that project's worktrees.
- Pi keeps sessions in its native host-side store, which isn't mounted in the
  VM. A `pi/sessions/` folder here is from the retired `agent-vm pi` launcher;
  see [Pi sessions](../pi/README.md#sessions).
- Claude uses `home/claude-state/` for history/memory; tracked settings are served
  read-only through `/etc/agent-config`, including managed settings and personal
  instructions/themes. This separates mutable runtime state from `.claude` config.
- All other root-disk changes are discarded on exit. Parallel sessions have
  separate VMs but intentionally share their project's agent history/memory.

Python environments built on the Mac cannot run in the VM, and rebuilding them
there would break the Mac's copy. The launcher sets `UV_PROJECT_ENVIRONMENT` to
`.venv-vm`, so `uv sync`, `uv run`, `uv add` and `uv venv` use that folder beside
the Mac's `.venv`, in the worktree. Bare `uv pip` still finds `.venv`; pass
`--python .venv-vm`. The global Git ignore covers `.venv-vm/`. `UV_LINK_MODE=copy`
avoids hardlink warnings, since uv's cache is on the guest-home mount.

Gondolin intercepts guest HTTPS with its own CA. System tools trust it, and
the launcher points Node at `/run/gondolin/ca-certificates.crt`. Chromium ignores
that bundle and takes added roots only from the agent's NSS database, so each
boot imports the CA into `~/.pki/nssdb` as `gondolin-mitm-ca`, replacing any
earlier entry; Playwright loads external HTTPS without `ignoreHTTPSErrors`.
That database lives in the shared guest home.
A failed import stops launch; deleting that project's `home/.pki` on the Mac
lets the next boot recreate it. The launcher also synchronizes the guest
clock at boot and every 30 seconds in Claude sessions to avoid certificate
failures after Mac sleep.

Public HTTP(S) internet access follows Gondolin's default policy. Internal/private
IP destinations and Mac services are blocked, with only the images-only clipboard
proxy mapped for Claude. No general project service mapping exists yet. The
proxy accepts only a fixed random GET route returning bounded PNG bytes from
AppKit; no text, file-path, upload or arbitrary-command endpoint. It cannot stop
an agent reading the clipboard image while its session is running, so avoid
copying private images during an untrusted session. Pi keeps its own attachment
extension instead.

## Daily use

```bash
pi                            # check the footer shows VM <id> before typing
claude                        # non-root, no approval prompts
claude --preview 3000         # opt-in HTTP ingress to guest localhost:3000
claude --preview 3000 -- -c   # use -- before subsequent agent flags if needed
# No preview ports are published by default.
gondolin list
gondolin attach <session-id>
agent-vm doctor
```

Ingress binds **host loopback only** on an ephemeral port, printed at launch.
The image has pinned Playwright/Chromium for guest-side screenshots/tests. Install
project dependencies in the worktree/home normally, or guest system packages
with `sudo apt-get`; host Brew and image changes remain deliberate user operations. Claude/Pi terminal OSC 7501 reaches Rex
without a tmux wrapper. Cloud Claude sessions remain complements, not part of
this local launcher.

## Build, upgrade, deploy

Agent, runtime, browser and image versions are pinned in `pins.json` and
verified during the build. Auto-update is disabled; the verifier is part of
the image fingerprint. The Alpine kernel/boot layer is separate from the Debian
OCI root filesystem.

Build prerequisites: Node 24+, QEMU, Docker or Podman, `lz4`, `e2fsprogs` and
macOS `cpio`. Brewfile tracks QEMU, `lz4` and `e2fsprogs`; installing and
starting a container engine is a separate user step.
Images are kept at
`~/.local/share/agent-vm/images/<fingerprint>/`. A missing/stale marker or a
mismatched guest marker stops launch and names `agent-vm build`. No default image
is downloaded as a fallback. Bump pins, update the lockfile if Gondolin changes,
rebuild and repeat host acceptance. Old images are not deleted automatically.

After branch acceptance, merge deliberately, quit running agents, and deploy
**from the primary checkout**, following [Pi migration](../pi/README.md#deploy).
Stow links are live source, not copies; do not merge/deploy a candidate whose
VM tests have not passed.

## Checks and remaining acceptance

Branch-local fixture tests after installing the shared dependencies:

```bash
node --test _tests/gondolin/*.test.mjs _tests/pi/*.test.mjs
just doctor --only-check
```

Run related shell regressions from the [root health checks](../README.md#checking-repository-and-host-health)
when changing those scripts.

Pi suites need Pi's Node SDK. They use `PI_TEST_SDK_ROOT`, a Node install behind
`~/.pi/agent/bin/pi`, `_scratch/pi-sdk`, then Homebrew. A Bun-binary Pi ships no
Node SDK; install a disposable, Git-ignored copy matching it:

```bash
npm install --ignore-scripts --prefix _scratch/pi-sdk \
  "@earendil-works/pi-coding-agent@$(~/.pi/agent/bin/pi --version)"
```

Unit tests use real VFS providers and HTTP substitution hooks,
synthetic tokens, fake VM transports, isolated Git repositories and synthetic
clipboard images. They do **not** prove kernel isolation, CLI authentication,
host clipboard/CLI image-paste compatibility, or live agent/TUI behavior.

After building, run the host-only checks in a **host terminal**, not through
agent/model tools:

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
bindfs/non-root/mount probes; boot/RSS/parallel-session budget; both
day-in-the-life trials; Claude
real sign-in placeholders, Ctrl+V, terminal status/bell, preview/Playwright,
commit/push/PR and restart/history/memory; Pi overflow through real VM reads,
codemode, review/answer/tldraw and reload/shutdown; and ruleset enforcement.
Track unobserved checks in [TODO.md](../TODO.md), then retire that tracker, not
these reusable acceptance checks. Mac agent retirement is a separate decision.

References: [Pi containerization/example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/gondolin),
[Gondolin custom images/networking](https://earendil-works.github.io/gondolin/),
[bindfs ownership mapping](https://bindfs.org/docs/bindfs.1.html),
[Claude devcontainer](https://code.claude.com/docs/en/devcontainer).

# Pi agent package

Pi runs on the Mac; model filesystem/shell tools run in a **Gondolin VM**. User
`!` and `!!` stay on the Mac. There is no native backend or automatic fallback.
See [shared VM setup, credentials, image and branch trials](../gondolin/README.md).
The migration is implemented but **not yet host-accepted or deployed**.

## Configuration

`pi/.pi/agent/` contains intentional settings, eight focused extensions and the
Gruvbox theme. Mutable settings, authentication, sessions and dependencies remain
host-local, not Stow source. `--no-folding` keeps `~/.pi` a real directory.

The template preserves `openai/gpt-6.1-sol/high`, its exact-model override, the
existing two llama.cpp choices, fullscreen and `gruvbox-dark/gruvbox-dark`.
Direct tools `read`, `write`, `edit`, `bash` plus codemode `on` remain enabled.
MCP is disabled (`-builtin:mcp`); codemode, tool-search and llama.cpp stay.

The `pi` launcher explicitly loads only Gondolin, answer, caffeinate,
clipboard-image, exit, review, review-summary, tldraw and the three retained
built-ins. This prevents a second/deployed backend from loading during branch
trials and excludes retired/generated host extensions. Host settings and skills
are otherwise retained in normal launches; `trial-pi` isolates them too.
Do not start the underlying host Pi binary as a workaround for a failed VM.

## VM tools — `extensions/gondolin.ts`

Based on Pi 1.4's official Gondolin example, using the SDK's tool definitions and
operation interfaces rather than replacing tool schemas, edits or serializers.
All direct/nested/codemode `read`, `write`, `edit` and `bash` calls use the same
VM. Reads are streamed and bounded to regular files up to 64 MiB; `~` means
the guest home, not the Mac home. Use guest Bash to inspect larger logs.
Unsupported tools (including host `powershell`, `grep`, `find`, `ls` and MCP
operations) are blocked; use guest Bash's `rg`, `find` and `ls`. The uv command
guard is gone. Python and package commands use the guest normally.

One VM starts per Pi session and closes on shutdown/reload/replacement. Startup
is singleflight; a failed startup is cached and shuts Pi down, not rerouted.
The whole canonical worktree and its common Git directory are mounted at the
same absolute paths, so linked-worktree pointers and normal Git commands work.
A subdirectory launch exposes the whole worktree, retaining the initial cwd.

`.pi`, `.claude`, Git hooks, VM launcher/config sources and global guest Git
config are read-only; `.git/config` remains writable, with the documented
`core.hooksPath`/host-execution risk. Identity is selected from the primary
repository with no fallback. Host credentials and CLI auth files are not mounted.
GitHub uses a Keychain-backed, host-scoped placeholder and HTTPS rewrites; Pi's
model/OAuth connection stays on the Mac. Public internet access is open;
Mac/private-network services are blocked. See the shared guide for exact limits.

`/gondolin` reports the VM, workspace and common Git directory. Docs/examples
are available read-only at **`/pi/docs`** and **`/pi/examples`**, not host install
paths. There is no `/sandbox`, `/uv-help`, `/wal` or `wal_append` anymore.

### Bash overflow

Pi's SDK writes complete overflow output on the host. `lib/vm-output.ts` exposes
only logs returned by this session's trusted Bash tool, through a private
read-only `/pi-output` mount. Tool text, details and codemode
`structuredContent.full_output_path` all name that guest path. A hardlink keeps
streaming output visible without mounting the host temp directory or copying
unbounded output into memory. Only regular SDK-pattern, same-user files are
accepted; owned originals/links are removed on clean shutdown. Crashes can leave
artifacts. Files are never supplied by a model-facing path argument.

Read an overflow log through `read` or guest Bash at the returned `/pi-output/...`
path. VM reads are covered by the opt-in real-VM test; SDK serialization and log
ownership/cleanup have fixture coverage. Codemode's own separate host overflow
files are not a general host-read bridge: filter output in scripts instead.

## Retained tools and commands

### Codemode and tool search — built-in

Codemode is `on`, not `only`: direct tools remain declared. Use it to batch
independent calls with `Promise.allSettled`, chain calls and return filtered
results. It delegates through the same VM overrides; it is not a shell escape.
Completed writes are not rolled back if a script later fails. No extra MCP
service, classifier, or image model is enabled by this migration.

### Caffeinate — `extensions/caffeinate.ts`

The trusted host extension asserts macOS idle-sleep prevention while work is
active and cleans up on settlement/shutdown. It does not keep the display on,
is inactive off macOS, and exposes no model-callable host process tool.

### Clipboard images — `extensions/clipboard-image.ts`

Keep Pi's Ctrl+V attachment flow: intercept only Pi-generated regular temporary
image files on interactive user input, turn them into image blocks, then remove
the temporary path/file. Host clipboard images do not need a VM mount. Select an
image-capable model. Claude/Amp use the separate images-only proxy instead.

### Answer — `extensions/answer.ts`

`/answer` extracts questions from the latest successful assistant response using
the selected authenticated model, then opens the terminal Q&A form. Tab/Shift+Tab,
multiline answers, submit confirmation and cancellation remain unchanged. Busy,
non-TUI, incomplete, malformed or oversized input is rejected; branch/model
changes cannot submit stale results. No model fallback. Submit/cancel has prior
live evidence; navigation/retention and local-model extraction still need checks.

### Diff review — `extensions/review.ts`, `review-nvim.lua`

`/review` is a deliberate host Neovim command, not a model tool. Scratch buffers
never open source files for writing. Comments return via a private temporary
file, removed before Pi resumes. A private Git index includes untracked files
without changing the real index/staging; base reviews use the merge base.
Cleanup covers submit, cancel, errors and session shutdown.

```text
/review
/review staged
/review unstaged
/review main...HEAD
/review --base main
/review --tui main...HEAD
/review help
```

Neovim mappings: `[f`/`]f` files, `[c`/`]c` hunks, `[r`/`]r` comments,
`<leader>rf` sidebar, `<leader>rc` add/edit, `<leader>rd` delete,
`<leader>rs` or `ZZ` submit, `<leader>rq` or `ZQ` cancel, `<leader>rh` help.
Multiline comments use an `acwrite` scratch buffer. `--tui` selects the retained
Pi keyboard/mouse interface; missing Neovim reports an error rather than silently
switching UI. Returned feedback includes path/hunk/line/context anchors and tells
the agent to inspect current VM files and preserve unrelated changes.

### Review summary — `extensions/review-summary.ts`

```text
/review-summary [base]
/review-summary complete [base]
/review-summary reset [base]
/review-summary help
```

Creates a pinned Git-range/rubric review kickoff, default base `main`. Requests
and explicit completions are reconstructed from the active session branch,
scoped to worktree, branch, base and history. Failed/incomplete reviews do not
advance a checkpoint. After a successful final response, explicitly `complete`;
it records only the requested HEAD, never newer commits. Repeating completion is
informational. Reset/history rewrites/scope changes require a full review.
Reload/tree UI checks remain pending; real-Git/session-state fixtures are retained.

### tldraw offline — `extensions/tldraw.ts`

A deliberately retained narrow host integration, not arbitrary host filesystem
access. Read the app-installed skill with `tldraw_guide`; do not copy proprietary
skill contents into this repository. Discover the intended canvas by name with
`tldraw_search(code)`, inspect ownership/shapes, then use
`tldraw_exec(docId, code)` and `tldraw_screenshot(docId, …)`. Never request or print
the app bearer token, use host curl as a workaround, or edit an open archive.

Search/exec return parsed JSON (`response.result`); screenshots return metadata
and a JPEG image block. In codemode:

```js
const shot = await tools.tldraw_screenshot({ docId, size: "medium" });
image(shot.image);
return { docId: shot.docId, pageName: shot.pageName };
```

Never log/return `shot.image.data`: that prints base64, not a picture. Screenshots
enter the selected provider's context; use only trusted boards/providers. This
bridge intentionally controls the Mac canvas app and is outside VM isolation.
The existing serializer/QuickJS tests remain; rerun a disposable saved canvas's
create/save/screenshot/cleanup flow after migration, not on an unrelated board.

### Exit — `extensions/exit.ts`

`/exit` uses `ctx.shutdown()`, never `process.exit()`, allowing VM cleanup.

### Rex and Herdr

Pi reports OSC 7501 natively; no host hook or extra status extension is required.
The VM does not wrap the host UI in tmux. See [Rex](../rex/README.md) for
notifications/shortcuts. Herdr may launch the shared `~/.local/bin/pi` wrapper;
its common Git directory is mounted for linked worktrees. The launcher's explicit
extension list omits Herdr's generated host extension; do not re-add an implicit
host tool backend. Workspace creation/management remains a user operation.

## Deploy

First complete [branch trials and shared host acceptance](../gondolin/README.md).
Do not merge just to test: Stow links in the main checkout are live.
Quit all Pi/Claude/Amp sessions before deployment, then run **on the Mac from the
primary checkout**, not from a worktree or model tool:

```bash
cd ~/code/github.com/hrmnjt/dev
# Inspect/remove only dangling retired links; preserve regular/custom files.
for file in \
  "$HOME/.pi/agent/extensions/sandbox.ts" \
  "$HOME/.pi/agent/extensions/uv.ts" \
  "$HOME/.pi/agent/extensions/wal-writer.ts" \
  "$HOME/.pi/agent/extensions/lib/native-policy.ts" \
  "$HOME/.pi/agent/extensions/lib/native-runtime.ts" \
  "$HOME/.claude/settings.json" \
  "$HOME/.claude/CLAUDE.md" \
  "$HOME/.claude/themes/gruvbox-dark-hard.json"; do
  if [ -L "$file" ] && [ ! -e "$file" ]; then rm -- "$file"; fi
done
just stowall
npm ci --prefix ~/.config/gondolin
npm install --prefix ~/.pi/agent
# Build the exact accepted image if it is not already in the local cache:
agent-vm build docker
```

Inspect any retired extension which is a regular file or a valid link to another
copy; do not overwrite it automatically. The new launcher's explicit allowlist
prevents loading it, and doctor reports leftovers. Keep existing host
`auth.json` and runtime settings. No provider login/model changes are required.
Reload the login shell (`exec zsh -l`) so the `pi`/`claude`/`amp` launchers win.

For a fresh Pi agent directory only:

```bash
cp ~/.pi/agent/settings.template.json ~/.pi/agent/settings.json
```

For an existing setup, quit Pi and apply only the MCP-disable delta, preserving
all other settings, authentication, models and appearance:

```bash
settings="$HOME/.pi/agent/settings.json"
jq '.extensions = ((.extensions // [])
  | map(select(. != "builtin:mcp" and . != "+builtin:mcp" and . != "-builtin:mcp")) + ["-builtin:mcp"])' \
  "$settings" > "$settings.tmp" && mv "$settings.tmp" "$settings"
```

The shared launcher also supplies `--no-mcp`. Remove old `GONDOLIN_GUEST_DIR`,
`GONDOLIN_VMM`, `PI_SANDBOX_BACKEND` and token-sharing shell exports if you kept
custom copies; no image override or host environment is forwarded to the VM.
Use a fresh process for this migration, not `/reload` inside the old native
session. Later reloads tear down the old VM before the new runtime starts.

## Checks

```bash
node --test _tests/pi/*.test.mjs _tests/gondolin/*.test.mjs
./_scripts/tests/rex-worktrees.sh
./_scripts/tests/doctor-stow.sh
./_scripts/tests/doctor-repository.sh
./_scripts/tests/sshsetup.sh
just doctor --only-check
```

Set `PI_TEST_SDK_ROOT` to the installed Pi package directory when not using the
Homebrew SDK default. Current fixture evidence is recorded in `TODO.md`; native
Seatbelt tests are retired, not re-labelled as VM enforcement proof. Host-only
VM integration is opt-in with `AGENT_VM_LIVE_TEST=1`; see the shared guide.
Remaining real checks include tool images, overflow reads/codemode, shutdown,
reload/new/resume, answer/review UI, tldraw, credentials/network policy, and Rex
status. No push, merge, deployment or live settings change is automatic.

## Local models and themes

The host llama.cpp router remains independent of the guest. From the host shell
run `llm start`, then `/login llama.cpp` once in Pi, accepting the local default
URL. `/llama` downloads/loads/unloads models; loaded model IDs appear in `/model`.
Do not expose the router or model cache to the VM. See [llama.cpp](../llama/README.md).

Themes are discovered under `~/.pi/agent/themes/`; `gruvbox-dark` remains the
tracked choice. New Pi source/config resources are read-only to VM tools;
changes to those protected trees require a deliberate host edit/deployment,
not an agent bypass. Host provider/image/local-first comparison trials remain
deferred; keep private session material local unless a cloud handoff is approved.

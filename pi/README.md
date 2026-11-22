# Pi agent package

Pi runs on the Mac. The Gondolin extension routes model filesystem/shell tools
into a **Gondolin VM**. User `!` and `!!` stay on the Mac. See [shared VM setup,
credentials, image and branch trials](../gondolin/README.md).

## Configuration

`pi/.pi/agent/` contains intentional settings, ten focused extensions and the
Gruvbox theme. Mutable settings, authentication, sessions and dependencies remain
host-local, not Stow source. `--no-folding` keeps `~/.pi` a real directory.

The template preserves `openai/gpt-6.1-sol/high`, its exact-model override, the
existing two llama.cpp choices, fullscreen and `gruvbox-dark/gruvbox-dark`.
Direct tools `read`, `write`, `edit`, `bash` plus codemode `on` remain enabled.
The MCP, codemode, tool-search and llama.cpp built-ins stay enabled.

Plain `pi` comes from Pi's installer and auto-discovers the Stow-deployed
`~/.pi/agent/extensions/gondolin.ts`. It also discovers other global extensions
and trusted project extensions, so review them and remove retired backends from
auto-discovery. Before typing anything, including after updates, check that the
footer shows `VM <id>`; the extension sets it once the VM is ready. If it's
missing, quit without typing: Pi can start with Mac tools if the extension
didn't load, and an unregistered `/gondolin` would then reach the model as a
prompt. Once loaded, the extension shuts Pi down on VM startup failure rather
than falling back to the Mac.

## VM tools — `extensions/gondolin.ts`

Based on Pi 1.4's official Gondolin example, using the SDK's tool definitions and
operation interfaces rather than replacing tool schemas, edits or serializers.
All direct/nested/codemode `read`, `write`, `edit` and `bash` calls use the same
VM. Reads are streamed and bounded to regular files up to 64 MiB; `~` means
the guest home, not the Mac home. Use guest Bash to inspect larger logs.
Unsupported tools (including host `powershell`, `grep`, `find`, `ls` and MCP
operations) are blocked; use guest Bash's `rg`, `find` and `ls`. The
[uv guard](#uv-guard--extensionsuvts) rejects pip/poetry commands before they
reach the VM; the image includes pinned `uv`.

One VM starts per session and closes on shutdown/reload/replacement. The
whole worktree and common Git directory retain their host paths. See the
[shared boundaries and persistence](../gondolin/README.md#boundaries-and-persistence)
for protected paths, identity, credentials, network access and the accepted
writable `.git/config` risk.

`/gondolin` reports the VM, workspace and common Git directory. Docs/examples
are available read-only at **`/pi/docs`** and **`/pi/examples`**, not host install
paths. There is no `/sandbox` anymore.

### Bash overflow

Read complete Bash output through `read` or guest Bash at the returned
`/pi-output/...` path. This private read-only mount exposes only trusted Bash
logs from the current session, not the host temp directory. Owned logs are
removed on clean shutdown; crashes can leave artifacts.

Codemode's own host overflow files are not a general host-read bridge: filter
large results inside scripts instead.

### Sessions

`pi -c`, `pi -r` and `/resume` use Pi's usual session store
(`~/.pi/agent/sessions/`, grouped by working directory), including sessions
from before Gondolin. The retired `agent-vm pi` launcher kept sessions in
`~/.local/state/agent-vm/<project key>/pi/sessions`. Browse those by pointing
Pi at that folder for one run, or fork one into the usual store from its
worktree; the original is left unchanged:

```bash
pi --session-dir ~/.local/state/agent-vm/<project key>/pi/sessions -r
pi --fork /path/to/session.jsonl
```

Worktree files keep their paths in the VM. Files outside the worktree, old
scratch or overflow-log paths, and Mac-built binaries such as `.venv` are not
available there.

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
image-capable model. Claude uses the separate images-only proxy instead.

### Answer — `extensions/answer.ts`

`/answer` extracts questions from the latest successful assistant response using
the selected authenticated model, then opens the terminal Q&A form. Tab/Shift+Tab,
multiline answers, submit confirmation and cancellation remain unchanged. Busy,
non-TUI, incomplete, malformed or oversized input is rejected; branch/model
changes cannot submit stale results. No model fallback.

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

### uv guard — `extensions/uv.ts`

Keeps Python work uv-first. Gondolin's bash tool calls its command check before
the VM runs anything: `pip`, `pip3`, `poetry`, `python -m pip`, `python -m venv`
and `python -m py_compile` are rejected with uv alternatives. `/uv-help` sends a
compact uv reference into the conversation. The VM image pins `uv` and `uvx`.

### WAL writer — `extensions/wal-writer.ts`

A deliberately retained narrow host integration: `wal_append(text, date?)` and
`/wal status|append <markdown>` append Markdown to the Obsidian WAL daily note at
`~/code/github.com/hrmnjt/worklog/wal/YYYYMMDD.md`. It runs in the host Pi
process, locks the note, creates a missing note from `wal/daily.md` when present
and takes no arbitrary target path. Codemode receives `{ displayPath, date,
compactDate, created, templateUsed, appendedBytes }`, never absolute paths. Use it
when asked to record a worklog, WAL, daily note or Obsidian note.

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
Test changes on a disposable saved canvas, never an unrelated board.

### Exit — `extensions/exit.ts`

`/exit` uses `ctx.shutdown()`, never `process.exit()`, allowing VM cleanup.

### Rex

Pi reports OSC 7501 natively; no host hook or extra status extension is required.
The VM does not wrap the host UI in tmux. See [Rex](../rex/README.md) for
notifications/shortcuts. Workspace creation and management remain user operations.

## Deploy

First complete [branch trials and shared host acceptance](../gondolin/README.md).
Do not merge just to test: Stow links in the main checkout are live.
Quit all Pi/Claude sessions before deployment, then run **on the Mac from the
primary checkout**, not from a worktree or model tool:

```bash
cd ~/code/github.com/hrmnjt/dev
# Inspect/remove only dangling retired links; preserve regular/custom files.
for file in \
  "$HOME/.pi/agent/extensions/sandbox.ts" \
  "$HOME/.pi/agent/extensions/lib/native-policy.ts" \
  "$HOME/.pi/agent/extensions/lib/native-runtime.ts"; do
  if [ -L "$file" ] && [ ! -e "$file" ]; then rm -- "$file"; fi
done
# Remove only the retired Stow link, never Pi's installer link or a custom file.
case "$(readlink "$HOME/.local/bin/pi" 2>/dev/null)" in
  */gondolin/.local/bin/pi) rm -- "$HOME/.local/bin/pi" ;;
esac
just stowall
npm ci --prefix ~/.config/gondolin
npm install --prefix ~/.pi/agent
# Build the exact accepted image if it is not already in the local cache:
agent-vm build docker
```

If `~/.local/bin` itself is an old Stow directory link, unfold it before
reinstalling Pi so the installer doesn't write into the checkout. If the
retired link was the only `pi` command, use the
[official Pi installer](https://pi.dev/docs/latest/quickstart#install) to
recreate it. Keep existing `auth.json` and runtime settings. An existing Gondolin
installation doesn't need dependency reinstalls or an image rebuild just to
switch launchers.

Before starting plain Pi, move retired extensions (including valid links and
regular files) out of auto-discovery; `just doctor` reports known leftovers.
It also warns about any other auto-discovered extension that isn't a Stow
link into this checkout (review or remove it), and about a `pi` on PATH that
isn't the installer's. Doctor can't see zsh functions or aliases, so remove any
custom `pi` ones, start a fresh login shell (`exec zsh -l`), then run
`type -a pi` and `pi --version` to check the installer command wins. Start `pi` from a project and check that the footer shows
`VM <id>` before typing anything. Future `pi update` commands run on the Mac
and don't require Stow or a VM image rebuild.

For a fresh Pi agent directory only:

```bash
cp ~/.pi/agent/settings.template.json ~/.pi/agent/settings.json
```

An existing setup needs no settings change. MCP stays enabled as before: servers
from `mcp.json` run on the Mac, and the tool guard still blocks their tools, as
the native sandbox did. Opening that boundary is a separate decision.

Remove old `GONDOLIN_GUEST_DIR`, `GONDOLIN_VMM`, `PI_SANDBOX_BACKEND` and
token-sharing shell exports if you kept custom copies; no image override or host
environment is forwarded to the VM.
Use a fresh process for this migration, not `/reload` inside the old native
session. Later reloads tear down the old VM before the new runtime starts.

## Checks

Use the [shared VM/Pi checks](../gondolin/README.md#checks-and-remaining-acceptance)
for dependencies, SDK discovery, unit tests and opt-in host integration.
Outstanding migration/UI checks are tracked in [TODO.md](../TODO.md).
Retired Seatbelt tests are not evidence of VM enforcement.

## Local models and themes

The host llama.cpp router remains independent of the guest. From the host shell
run `llm start`, then `/login llama.cpp` once in Pi, accepting the local default
URL. `/llama` downloads/loads/unloads models; loaded model IDs appear in `/model`.
Do not expose the router or model cache to the VM. See [llama.cpp](../llama/README.md).

Themes are discovered under `~/.pi/agent/themes/`; `gruvbox-dark` remains the
tracked choice. New Pi source/config resources are read-only to VM tools;
changes to those protected trees require a deliberate host edit/deployment,
not an agent bypass. Keep private session material local unless a cloud handoff is approved.

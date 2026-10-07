# pi agent package

This directory is my personal package for [pi](https://pi.dev): extensions,
themes, settings defaults, and a native macOS sandbox. It is deliberately small
and self-contained.

The package is deployed into `~/.pi/agent` with GNU stow. Pi then auto-discovers
extensions from `~/.pi/agent/extensions/*.ts` and themes from
`~/.pi/agent/themes/*.json`.

## Layout

```text
pi/
├── .pi/
│   └── agent/
│       ├── extensions/
│       │   ├── answer.ts          # Interactive answers to assistant questions
│       │   ├── caffeinate.ts      # Keep macOS awake while the agent is working
│       │   ├── clipboard-image.ts # Attach clipboard images before sandboxed tools
│       │   ├── exit.ts            # Graceful /exit command
│       │   ├── sandbox.ts         # Mandatory macOS launch-directory write confinement
│       │   ├── lib/               # Native policy and process implementation
│       │   ├── review.ts          # Neovim-first diff review command
│       │   ├── review-nvim.lua    # In-memory Neovim review UI
│       │   ├── review-summary.ts  # Model-driven PR review summary
│       │   ├── tldraw.ts          # Authenticated host-local canvas API bridge
│       │   ├── uv.ts              # Prefer uv over pip/poetry/venv
│       │   └── wal-writer.ts      # Append host Obsidian WAL notes
│       ├── package.json           # Package/module metadata
│       ├── settings.template.json # Intentional settings tracked in git
│       └── themes/
│           └── gruvbox-dark.json
└── README.md
```

Runtime files live under the real host directory `~/.pi/agent` and are
intentionally not tracked:

- `~/.pi/agent/settings.json` — written by pi at runtime
- other host-local files such as `auth.json`, `sessions/`, and `node_modules/`


## Native sandbox

**Policy correction applied; verification incomplete:** the contract below replaces
the initial offline/read-only-Git policy. The host applied the source patch and
removed retired npm dependencies (audit: zero vulnerabilities). Existing running
sessions retain the old rules until restart/reload.

**Native is the only backend on this branch.** After deployment, start plain
`pi` and inspect `/sandbox`. There is no VM, backend selector, bypass command,
project policy override, or unsandboxed fallback. An unsupported platform,
missing launcher, or failed initialization blocks model tools.

Uses macOS Seatbelt directly through `/usr/bin/sandbox-exec`, with Pi's supported
tool factories and no npm sandbox/proxy dependency. The profile confines filesystem
writes, without the previous runtime's mandatory source/Git/shell-file locks or
network policy. A permitted scratch write and denied scratch-marker write must
pass the startup self-test before model-controlled input is accepted. The marker
is already protected by the real session profile, so this check also works when
`TMPDIR` is inside the launch directory or Pi starts in the temp-directory root.
Failure stays blocked until a fresh process/reload. This setup requires macOS.

The model uses real host paths and installed Pi documentation/example paths.
The four default filesystem/shell tools are `read`, `write`, `edit`, and `bash`;
exploration uses sandboxed `rg`, `fd`, and `ls`. User `!` / `!!` commands remain
explicit, **unsandboxed host** operations. Authentication, models, the local
shortlist, theme, fullscreen, and persistent codemode settings are unchanged.

- **Workspace:** the canonical directory where Pi starts, matching Gondolin's
  writable `/workspace` mount. Launching from a subdirectory does not silently
  widen writes to the Git root. Choose a narrow project directory; launching in
  home or an ancestor deliberately grants a broader boundary. Normal source edits
  happen directly in the live project, including Herdr worktrees.
- **Enforcement:** `read`, `write`, `edit`, and bash all use sandboxed processes.
  Writes resolve existing parents and symlinks; dangling links fail closed.
  File writes use stdin, `O_NOFOLLOW`, and hard-link checks before truncation.
  File helpers read regular files up to 64 MiB; use sandboxed bash to filter
  larger readable files. Images retain Pi's normal attachment/resize behavior.
- **Write boundary:** filesystem writes stay in the launch directory, private
  scratch, and discovered Git metadata. Symlinks resolve to their real targets;
  an alias cannot make another project writable. There are no blanket `.pi`,
  Pi-source, or shell-file locks. This repo's Stow-linked Pi configuration is
  editable from this repo; outside projects cannot write it through an alias.
  Existing sessions retain loaded rules; new/reloaded sessions use changed source
  immediately, because Stow links are live, not a deployment copy.
- **Reads:** ordinary host reads, including temp and CLI credential files, are
  available. This is not credential/read isolation. Never print secrets or send
  private files to services without approval. Preserve the old dev `_models`
  read/write exclusion only when that cache is beneath the launch directory.
- **Scratch/cache:** one private mode-0700 temp directory, with a protected marker
  pinning its root against symlink replacement. `TMPDIR`, XDG/uv/npm caches point
  there. Owned Pi bash overflow logs are created by the trusted SDK outside the
  child profile, remain readable, and are removed along with scratch on clean
  shutdown/reload. A crash can leave artifacts. No shared-temp write allowance.
- **Network/IPC:** not restricted by this profile. Normal networking, loopback,
  and SSH-agent access work; credential/proxy environment variables are retained.
  Outer-shell startup/injection variables are still stripped. Downloads/project
  package installs must respect the write boundary; global installs, Stow,
  launchd, VPN, and local-model management remain deliberate user operations.
- **Git:** use bash `git status`, `add`, `commit`, `fetch`, and `push` when requested,
  not direct file edits in `.git`. Bash may write discovered Git metadata outside
  cwd, matching Gondolin's linked-common-directory mount. Direct write/edit tools
  reject metadata targets. Native Git uses host identity rules and
  `user.useConfigOnly=true`, with no fallback; linked worktrees inherit their
  primary repository's identity. Clone/worktree destinations must be writable or
  created deliberately on the host.
- **Routing:** direct, nested, and codemode calls reach the same registered
  overrides and uv guard. Unsupported tools are blocked, not silently run on
  the host. The existing WAL and tldraw tools remain narrow trusted exceptions.
  Codemode is not enabled by this change; trial it explicitly before activation.

This is practical tool-level **filesystem write confinement**, not a VM or
enterprise boundary. Pi and trusted extensions run with host permissions; review
what you load. Network/IPC calls can ask other services to perform effects outside
this process's filesystem boundary. Credential files are readable and shell code
can transmit data. Seatbelt does not promise isolation for pre-existing cross-
boundary hard links through bash (direct file writes reject them). Writable Stow
source can affect live host configuration. Do not treat a hostile checkout or
broad writable directory as an isolated VM.

### Verification

Pi **1.0.0** needs no upgrade. The earlier restricted policy passed its macOS
suite (16 passed, 1 expected skip); that is not proof of the corrected policy.
Against the prepared source, policy/registration and Stow regression tests pass:
**22 passed, 0 failed, 1 expected skip**. Syntax checks pass, and Pi 1.0's official
loader loads all five changed extension factories without warnings. After fixing
`core.hooksPath=.` to absolute `.git/hooks` in the fixture (no policy change), the
corrected-policy host kernel rerun reports **1 passed, 0 failed**. It verifies
startup self-test, file operations/confinement, editable Pi source, Git commands
and hooks, loopback/Unix sockets, narrow launches, linked-worktree commits,
images, overflow and cleanup. The initial combined host suite reports
**23 passed, 0 failed, 1 expected skip**; the updated full host rerun reports
**46 passed, 0 failed, 1 expected skip**, including real Seatbelt enforcement.
Host Stow succeeds. Full host doctor rerun reports
**24 passed, 0 failed, 0 warnings**, including Stow, Pi deployment/settings,
personal/work/unknown/linked Git identity, Herdr and GitHub CLI authentication.
The current outer sandbox denies nested `sandbox_apply`, so enforcement trials
run on the host. All tracked TypeScript extensions now pass strict semantic
checking against the installed Pi 1.0.0 declarations (`skipLibCheck` for installed
dependencies); compiler/Node typings are installed only in private scratch.

The startup-probe review finding is fixed without changing policy permissions.
Two new mock regressions cover project-local `TMPDIR` and temp-root launches;
both fail against the old source and pass with the protected-marker probe.
The no-op executor test now simulates a successful permitted write plus marker
corruption and still fails closed. Policy tests: **14 passed, 1 expected skip**.
The real Seatbelt suite includes both launch cases and marker/cleanup checks,
but those additions still need a host-terminal rerun; mocks are not kernel proof.

A fresh-process `/sandbox` confirms the revised launch boundary, scratch, Git
metadata exception and unrestricted network/IPC profile are loaded. Codemode
and reloaded tldraw structured calls/save/JPEG forwarding are verified below.
Other interactive commands, clipboard images, Herdr workflow and complete
reload/cleanup checks remain pending. Doctor validates installation
and configuration, not those interactive behaviors.

Follow [deployment](#deploy-on-the-host-mac), then run in a host terminal on the
Mac with Node 24+ (not through already-sandboxed model tools):

```bash
node --test _tests/pi/*.test.* _tests/meta/*.test.*
./_scripts/doctor.sh
pi
```

Tests live under `_tests/pi/`, outside the Stow package, so they are not
deployed into the home directory. If Pi is installed outside its normal Homebrew location, set `PI_TEST_SDK_ROOT`
to the installed Pi package directory for the tests. The macOS test creates a
disposable nested Git workspace beneath cwd and tests file operations, external
writes/deletes, symlink/new-parent escapes, editable Pi source, Git commands/hooks,
launch-subdirectory and linked-worktree confinement, pinned scratch, loopback and
SSH-agent-style sockets, cancellation/timeout, images, and overflow access/cleanup.
It uses only disposable fixture repositories and servers; it does not download
packages, access real keys, or push to your origin.
Registry mocks test registration/failure routing, not kernel enforcement.
Doctor checks prerequisites, **not** full enforcement.

In Pi, check `/sandbox`, ordinary workspace edits, bash Git status/diff,
personal/work/linked/unknown-path identity, `/answer`, `/review`,
`/review-summary`, clipboard images, WAL, tldraw, and a Herdr linked worktree.
Verify real review paths, reload/restart, and clean scratch/log removal. The
native profile preserves normal Git/network commands within the filesystem write
boundary. Verify real CLI authentication and requested remote operations separately;
deployment and host-global operations remain user tasks.

For a session-only codemode trial, restart/resume with an explicit CLI tool list
(the `/tools` selector is an optional example extension, not a built-in command):

```bash
pi -c --tools read,write,edit,bash,codemode,wal_append,tldraw_guide,tldraw_search,tldraw_exec,tldraw_screenshot
```

This preserves the direct tools and narrow bridges. Verify nested read/write,
rejected external write, uv rejection, large bash output and its
`full_output_path`, and a script that writes then throws. Completed writes
are **not rolled back**. Keep persistent model/tool settings unchanged. Only
probe external paths you created for the test; do not ask Pi to bypass denials.

Recover a previous setup through a deliberate host Git checkout/deployment if
needed, not a runtime backend switch. Do not merge until host results are
recorded.

## The tools and commands

### Codemode — built-in extension

The settings template enables `codemode` with `codemode.mode: "on"`. Direct
`read`, `write`, `edit` and `bash` remain declared; this is not `only` mode.
No extra extension, MCP server, classifier or image-generation model is needed.

The live session-only trial passed nested read/write/edit, direct-read comparison,
uv rejection, structured nonzero exits, >1 MiB bash output and readable
`full_output_path`, rejected file-tool/bash writes to an SDK-owned external log,
and completed-write preservation after an intentional script failure. The
workspace probe was cleaned up; owned SDK overflow logs clean up on shutdown.

Existing host runtime settings are not replaced by the template. To enable only
this approved delta, **quit Pi first**, then run in a host terminal:

```bash
settings="$HOME/.pi/agent/settings.json"
jq '.defaultTools = ((.defaultTools // ["read","write","edit","bash"])
    | map(select(. != "codemode" and . != "+codemode" and . != "-codemode"))
    + ["+codemode"])
  | .codemode = ((.codemode // {}) + {"mode":"on"})' \
  "$settings" > "$settings.tmp" && mv "$settings.tmp" "$settings"
pi -c
```

This preserves other tool selections, codemode options, models, authentication,
theme and display preferences. Confirm direct tools and `codemode` are available
without `--tools`. Host runtime activation and fresh-default startup are verified.
For a custom agent directory, use its `settings.json` instead.

To roll back activation, quit Pi and apply the same `defaultTools` expression
with `["-codemode"]` instead of `["+codemode"]`, then restart. Do not overwrite
runtime settings from the template or remove unrelated preferences.

### Caffeinate — `extensions/caffeinate.ts`

This starts macOS `caffeinate` while the agent is working, preventing idle
system sleep while still allowing the display to turn off normally. It stops
when the agent has fully settled and also cleans up during session shutdown.
The assertion is tied to the Pi process so it cannot remain active after a
crash.

The extension runs in the host Pi process rather than through a model-facing
sandboxed model tool. It is inactive on non-macOS systems and reports only unexpected
`caffeinate` failures.

### Clipboard image attachment — `extensions/clipboard-image.ts`

Pi's `Ctrl+V` image handling stores clipboard bytes in a host temporary file
and inserts that path into the editor. This extension intercepts interactive input containing
Pi-generated `pi-clipboard-<uuid>.*` paths, converts those files into image
attachments, removes the host paths from the prompt, and deletes the temporary
files after loading them.

The host-side read is intentionally restricted to regular PNG, JPEG, GIF, and
WebP files with Pi's generated filename pattern directly under the host temp
directory. It is triggered only by interactive user input and does not expose a
host filesystem tool to the model.

On macOS, copy a screenshot to the clipboard and paste it into Pi:

```text
Cmd+Shift+5 → copy screenshot → Ctrl+V
```

Use a model that advertises image input. No sandbox mount or project-local
screenshot copy is required.

### Herdr integration

[Herdr](https://herdr.dev/) provides persistent terminal workspaces and tracks
Pi's lifecycle state. Its bundled Pi integration is generated on the host rather
than tracked in this repository:

```bash
brew install herdr
herdr integration install pi
herdr integration status
```

The installer writes `~/.pi/agent/extensions/herdr-agent-state.ts`. It can
coexist with this Stow package because `--no-folding` keeps the extensions
directory real. Herdr worktrees under `~/.herdr/worktrees` remain live host
worktrees; native tools read the primary common Git directory without mounts
and inherit its identity. Bash Git commands can update that metadata. The plugin launches
plain `pi`, which now uses the native sandbox without a special environment.

The optional Herdr agent skill is not installed. The write profile does not block
host IPC, but Herdr/workspace management remains deliberate user activity.

The normal layout uses one default Herdr session, one workspace per repository
worktree, and two full-screen tabs per workspace: `pi` and `shell`. Worktree
creation, shortcuts, explicit `origin/main` branching, and cleanup are documented
in the [Herdr package guide](../herdr/README.md).

### Answer extractor — `extensions/answer.ts`

Sometimes the assistant ends with a list of questions. `/answer` turns that into
a focused interactive Q&A flow.

It uses the latest successful final assistant message on the active branch,
asks the selected model to extract questions as validated JSON, then opens the
same terminal Q&A flow. Submitted answers become a normal user message. Tab,
Shift+Tab, navigation, multiline input, submit confirmation and cancellation are
preserved; focus forwards to the editor and narrow rendering stays bounded.

Extraction uses `ctx.modelRegistry.streamSimple()` with the selected model;
provider authentication/headers stay internal, and local models do not need an
artificial nonempty API key in this extension. No model fallback or automatic
local/cloud routing. The command rejects non-TUI modes (including RPC), missing
models, busy turns and incomplete/empty/oversized assistant responses. It validates
up to 64 questions, each question/context at most 8192 characters, within 128 KiB
of JSON; malformed/unsafe output and provider failures are reported as errors,
not cancellation. Only user/provider aborts are cancellation. Late results after
cancel are ignored, and branch/model changes block stale submissions.

Seven isolated extraction/UI tests pass; actual local/cloud extraction and
interactive submit/cancel still need host verification.

Command:

```text
/answer
```

Useful when I want to answer several clarifying questions without copy/pasting a
manual response.

### Diff review — `extensions/review.ts` and `extensions/review-nvim.lua`

`/review` opens the current Git diff in host Neovim by default. The diff and
comment editors are scratch buffers: source files are never opened for writing,
and review comments stay in Neovim memory until submission. They return to pi
through a private mode-0600 file inside a mode-0700 OS temporary directory,
which the extension removes before restoring pi. Neovim uses the normal host
configuration, including the Stow-deployed LazyVim setup; this deliberate user
command runs outside the model-tool sandbox.

Commands:

```text
/review
/review staged
/review unstaged
/review main...HEAD
/review --base main
/review --tui main...HEAD
/review help
```

The Neovim review buffer preserves standard Vim motions and search. Review-only
buffer mappings are:

```text
[f / ]f       previous/next changed file
[c / ]c       previous/next diff hunk
[r / ]r       previous/next review comment
<leader>rf    toggle the changed-files sidebar
<leader>rc    add or edit a multiline comment
<leader>rd    delete the comment at the cursor
<leader>rs    submit the review (also ZZ)
<leader>rq    cancel the review (also ZQ)
<leader>rh    show review help
```

The changed-files sidebar contains only files in the selected diff and jumps
within the unified review buffer; it does not use netrw or open writable source
buffers. Multiline comments use an `acwrite` scratch buffer, so `:w`, `:wq`,
`ZZ`, and `Ctrl-s` update only the in-memory review state.

`--tui` opens the previous self-contained pi review UI instead. It retains its
keyboard and mouse navigation for environments where host Neovim is unavailable.
If `nvim` is missing, the command reports the error and suggests `/review --tui`
rather than silently changing interfaces. The TUI follows Pi 1.0's editor theme
and normalized component-local mouse contracts; legacy SGR input stays supported.
Fullscreen owns its mouse modes, so exiting review does not disable them. Editor
focus and idempotent mouse cleanup are covered by two component tests; actual
Neovim/TUI submit/cancel remains a host check.

Submitted comments from either UI include an anchor snapshot: file path, hunk,
selected line, line kind, and nearby diff context. The generated message tells pi
to treat the reviewer's feedback as authoritative, use the embedded snippet only
as a locator, inspect the referenced files under the real host repository path,
preserve unrelated
changes, avoid resurrecting deleted files unless explicitly requested, and
summarize how each comment was addressed.

### Review summary — `extensions/review-summary.ts`

This preserves the older model-driven review flow. Instead of opening a TUI, it
creates a structured PR review kickoff prompt with commits, changed files,
diffstat, and a detailed rubric covering design, performance, security,
effectiveness, correctness, and code quality.

Commands:

```text
/review-summary
/review-summary develop
/review-summary complete [base]
/review-summary reset [base]
/review-summary help
```

It compares against `main` by default and pins the exact Git range in the review
prompt. Requests and confirmed completions live in non-context Pi session custom
entries, scoped by canonical repository/worktree, Git branch, resolved base and
merge-base. Every command reconstructs only the active session branch: restart,
reload, compaction and tree navigation do not leak abandoned-branch checkpoints.
A changed scope or rewritten history falls back to a full review.

A request **does not** advance the checkpoint. After a successful final review,
explicitly run `/review-summary complete` (or `complete develop` for that base).
It rejects completion without a successful final assistant response and records
only the requested HEAD, never newer commits. This is your confirmation that the
review finished, not an automatic claim about review quality. Repeated requests
for unfinished reviews cover the unconfirmed range again. Confirmed reviews ask
the model to check previous findings before reviewing new commits. `reset [base]`
clears only that active scope so it can be reviewed in full again.

Six real-Git/SDK session regression tests and strict semantic type-check pass:
reload/reconstruction, navigation, compaction, failed/cancelled/truncated reviews,
scoped isolation, history rewrites, reset and setup failure/races. Interactive
verification remains pending. The new `lib/review-state.ts` needs `just stowall`
from the host before `/reload`; do not reload while its deployed link is missing.

### uv guard — `extensions/uv.ts`

This keeps Python work uv-first. The extension exports command-detection helpers
used by the native sandbox bash wrapper: when the assistant tries common Python tooling
commands such as `pip`, `pip3`, `poetry`, `python -m pip`, `python -m venv`, or
`python -m py_compile`, the command is blocked with uv alternatives.

Command:

```text
/uv-help
```

That command sends a compact uv reference back into the conversation, including
pip/poetry/venv mappings.


### WAL writer — `extensions/wal-writer.ts`

This is the one host-side write escape hatch. It registers a model tool named
`wal_append` and a manual `/wal` command for appending Markdown to my Obsidian WAL
(work activity log) daily note:

```text
~/code/github.com/hrmnjt/worklog/wal/YYYYMMDD.md
```

The tool supports controlled writes from sessions outside the worklog project,
without a general external-write allowance. It runs in the trusted host Pi process,
locks the target note, creates a missing daily note from `wal/daily.md` when that
template exists, and appends exactly the Markdown it is given to the end of the
file.

Model-facing tool:

```text
wal_append(text, date?)
```

Direct calls retain the readable append summary and existing details. Codemode
receives `{ displayPath, date, compactDate, created, templateUsed, appendedBytes }`.
Internal absolute target/template paths remain renderer details, not script
output; no arbitrary target-path argument is added. Errors still reject calls.

Live verification on 20261006 appended one explicitly approved test line to the
existing daily note. Codemode consumed structured fields directly (68 appended
bytes reported), and a read-only exact-tail check verified the approved line
without returning the rest of the note. No duplicate append or arbitrary
external write.

Commands:

```text
/wal status
/wal append <markdown>
```

Use this when I ask to record a worklog, WAL, daily note, or Obsidian note from a
pi session.

### tldraw offline — `extensions/tldraw.ts`

The app-installed `tldraw-offline` skill lives under
`~/.pi/agent/skills/tldraw-offline/`. Install it from tldraw offline's home
screen; do not track or copy its proprietary contents into this repository.
Use its four focused bridge tools rather than the skill's host `curl` / `tq`
examples. The bridge handles credentials internally and forwards screenshots as
images. Write confinement does not make the API token unreadable or block loopback;
never request or print that token.

- `tldraw_guide` reads only the app-installed `SKILL.md` so the agent can consult
  the current instructions through the narrow bridge instead of exposing a host filesystem tool.
- `tldraw_search(code)` calls the local `/api/search` endpoint to discover docs,
  inspect shapes, and read recipes.
- `tldraw_exec(docId, code)` calls `/api/doc/:id/exec` for the explicitly
  selected document. It can change a canvas and execute JavaScript in the app.
- `tldraw_screenshot(docId, size?, mode?, bounds?)` asks the app for a JPEG of a
  selected canvas (or app window) and returns image content directly to a
  vision-capable model. `bounds` optionally crops canvas page coordinates.

The extension reads the app's port and per-launch bearer token on each request;
it sends requests only to `127.0.0.1` at that port, with no arbitrary URL or
host filesystem tool. The bridge never returns the token. These tools
*do* grant the model control of tldraw documents, so use them only on canvases
you trust. For screenshots the bridge reads only a regular JPEG named for the
selected document inside tldraw's own temp directory, with a 10 MiB limit. It
never returns or accepts an arbitrary host file path. Screenshot images enter the Pi session and the selected model's
context; avoid capturing private boards with an untrusted provider. The bridge
still does not support durable board-script workspace edits; don't use the
installed skill's host-only shell commands as a workaround. Keep `.tldraw`
archives out of direct edits while open.

Search/exec now declare an output schema for arbitrary JSON and return the
parsed API response to scripts, preserving its full shape and direct JSON text.
A normal response's data stays under `response.result`; script authors no longer
need to parse tool text. Guide output remains text. Names/arguments, credential
handling, request bounds, screenshot file checks and failures are unchanged.

Screenshots return metadata plus an image block to scripts, with no file path.
Direct calls still receive the same metadata text and JPEG image attachment.
In codemode, forward the image explicitly and return only metadata:

```js
const shot = await tools.tldraw_screenshot({ docId: selectedDocId, size: "medium" });
image(shot.image);
return { docId: shot.docId, pageName: shot.pageName, width: shot.width, height: shot.height };
```

Never return/log `shot.image.data` or the whole screenshot object: that prints
base64 as text rather than showing the image. Six schema/serializer/validation
and SDK QuickJS transport tests pass; these use fixtures, not a real canvas,
vision decoder or WAL append. A separate live trial after reload verifies
structured search/exec fields, direct exec output, local scratch-canvas save,
visible JPEG forwarding and app-error rejection. The labeled rectangle rendered
correctly with no lints; its disposable shape was removed and `scratch.tldraw`
restored to zero shapes/bindings with no unsaved changes. No other canvas was
touched. The separate explicitly approved WAL append and exact-tail verification
also pass on 20261006; structured-result verification (PI-05) is complete.

First interactive trial (after `just stowall` and `/reload`): open and save
`scratch.tldraw`, then ask Pi:

```text
Use tldraw_guide, then find my saved scratch.tldraw with tldraw_search.
Confirm its ownership and existing shapes before editing. On that canvas,
draw a small three-step Request → Review → Ship flow with bound arrows.
Read the relevant app recipe first; verify shapes, bindings, and lints once,
then save the local document. Do not edit any other canvas.
```

To check the result visually, ask Pi to find `scratch.tldraw` by name again
and call `tldraw_screenshot` with that document id and `size: "medium"`.
Pi sends the JPEG as an image tool result, not a path for the guest to read.
Select a model with image input first (`/model`).

The first tool call must happen on the host, so this end-to-end test needs a
running tldraw offline app and Pi on the Mac; the development harness cannot
simulate that integration.

### Graceful exit — `extensions/exit.ts`

A tiny command that asks pi to shut down cleanly via `ctx.shutdown()` instead of
exiting the Node process directly.

Command:

```text
/exit
```

## Deploy on the host Mac

Quit old Pi sessions first (`/exit`) so they do not retain old tool registrations.
Run deployment in a **host terminal**, not through model tools:

```bash
cd ~/code/github.com/hrmnjt/dev
# Stow does not remove links to files that disappeared from a package.
# Remove only dangling retired links; never overwrite regular/custom files.
for file in \
  "$HOME/.pi/agent/extensions/gondolin.ts" \
  "$HOME/.pi/agent/gondolin-image.json" \
  "$HOME/.pi/agent/extensions/lib/backend.ts"; do
  if [ -L "$file" ] && [ ! -e "$file" ]; then rm -- "$file"; fi
done
just stowall
npm install --prefix ~/.pi/agent
pi
```

The deleted extension must not remain in `~/.pi/agent/extensions/`, because Pi
auto-discovers it. If that path is a regular/custom file or a valid symlink to
another copy, inspect and retire it manually before launching; the loop above
deliberately leaves it alone. Existing `settings.json` and `auth.json` stay
host-local and unchanged. Do not reset settings to the template for this trial.

The manifest no longer includes the VM or runner; npm removes those obsolete
root dependencies. The image definition, image-build recipe, and VM-only Brew
entries are gone. Old images under `~/.gondolin/` and already-installed VM
formulas are unused but not automatically deleted/uninstalled. Inspect host
artifacts yourself if you want to reclaim them; avoid blanket Brew cleanup.

The Zsh image/token exports are removed. A current shell can still carry old
values: unset `GONDOLIN_GUEST_DIR`, `GONDOLIN_VMM`, and `PI_SANDBOX_BACKEND` if
present. If `GH_TOKEN` came only from the retired sharing export, unset it too;
`gh` continues using its saved host login. No provider/model login changes.

`--no-folding` keeps `~/.pi` real so Pi and npm write mutable runtime state on
the host, not into the tracked checkout. For later extension edits, re-stow and
use `/reload`; for this migration, use a fresh Pi process. Edits to existing
Stow-linked source are already deployed: a reload/restart loads them, with no
additional Stow step. Pi source is editable when its canonical target is inside
the launch directory; it is not specially locked against development.

## First-time settings setup

`settings.template.json` tracks intentional defaults, including the minimal
direct tool set (`read`, `write`, `edit`, and `bash`) plus codemode `on`, and
`openai/gpt-6.1-sol` with `high` thinking. The local-model shortlist stays intact.
Pi owns `settings.json`
and may update volatile keys such as `defaultModel`, `defaultProvider`, and
`lastChangelogVersion`.

If the host-local `settings.json` does not exist yet:

```bash
cp ~/.pi/agent/settings.template.json ~/.pi/agent/settings.json
```

If it already exists and you want to apply the template while preserving other
runtime keys:

```bash
jq -s '.[1] * .[0]' \
  ~/.pi/agent/settings.template.json \
  ~/.pi/agent/settings.json \
  > ~/.pi/agent/settings.json.tmp \
  && mv ~/.pi/agent/settings.json.tmp ~/.pi/agent/settings.json
```

Do not create runtime settings under `pi/.pi/agent/`; that directory contains
the tracked package source, while Pi should write to the real host directory.

## OpenAI migration and remaining host checks

The live catalog lists `openai/gpt-6.1-sol` with text/image input and reasoning,
272,000-token context. This is catalog metadata, not a successful authenticated
request or a verified account limit. User OpenAI OAuth login succeeded and the
exact model is authenticated/available. The user chose to defer real-task, image
and provider-extension checks and apply defaults now; do not claim those checks
passed. Template and host settings default to `openai/gpt-6.1-sol/high`, with
an exact-model `high` override. Host settings are read-only verified and the user
reports the activation/fresh-start procedure complete. Keep the old login.

After the new review helper is deployed, run in a **host terminal**:

```bash
just stowall
node --test _tests/pi/*.test.* _tests/meta/*.test.*
./_scripts/doctor.sh
```

Then in Pi:

```text
/reload
/login openai
```

Use the ChatGPT/OAuth method if offered for your subscription. Keep the working
`openai-codex` connection; do not logout or copy credential values. Once login
succeeds, verify `openai/gpt-6.1-sol` appears in `/model`, select it for the current
session, then choose `high` in `/thinking`. If the exact model or thinking level
is unavailable, stop and report it—no substitute. The user has explicitly deferred
real-task/image checks; to apply only the approved defaults, quit Pi and run in a
host terminal (use your custom agent directory if applicable):

```bash
settings="$HOME/.pi/agent/settings.json"
jq '.defaultProvider = "openai"
  | .defaultModel = "gpt-6.1-sol"
  | .defaultThinkingLevel = "high"
  | .modelThinkingLevels = ((.modelThinkingLevels // {}) + {"openai/gpt-6.1-sol":"high"})
  | if (.enabledModels | type) == "array" then
      .enabledModels |= (. + ["openai/gpt-6.1-sol"] | unique)
    else . end' "$settings" > "$settings.tmp" && mv "$settings.tmp" "$settings"
pi
```

This preserves tools, codemode, authentication, appearance, local models and
other model-specific thinking choices. An existing enabled-model list retains
its choices and gains the exact requested model; an absent list remains absent
(all available models). `pi -c` resumes the session's model, so use plain `pi` to
check defaults in a fresh session. Task/image/extension checks remain deferred,
not passed; no old credentials are removed.

Remaining manual checks: `/review` Neovim submit/cancel, `/review --tui` mouse and
keyboard submit/cancel, `/review-summary` unfinished/reload/tree/explicit completion,
`/answer` extraction/submit/cancel with cloud and local models, clipboard images,
Herdr linked worktrees and clean reload/shutdown scratch/log removal. The core
native kernel suite already passed; rerun the updated full suite outside nested
Seatbelt confinement before merging. Nothing is pushed or merged automatically.

Current automated evidence: all ten tracked factories load without errors via
Pi's official loader; all TypeScript extensions pass strict semantic checking;
non-kernel regressions report **45 passed, 0 failed, 1 expected skip**. The
subsequent full host rerun reports **46 passed, 0 failed, 1 expected skip**;
full host doctor rerun: **24 passed, 0 failed, 0 warnings**. User Stow succeeds.
Earlier repository doctor reports **12 passed, 0 failed, 0 warnings** in-session,
with an
expected denied `_models` traversal diagnostic from filesystem confinement.
`git ls-remote origin HEAD` succeeds against the SSH GitHub remote without
fetching, pushing or altering local refs. These are not live TUI/kernel proofs.

### Bounded local-first investigation

No loaded llama.cpp chat model is currently available to Pi. Starting the router,
loading/downloading models and login stay deliberate host/user actions; follow
[Local models](#local-llamacpp-models) and the existing shortlist, not a new model
or automatic fallback. Once a selected local model is available, compare it and
the verified requested cloud model in separate fresh sessions using only public
or synthetic fixtures: exact-response instruction following, a short synthetic
summary, read-only exploration of a disposable public fixture, and its small
unit-tested bug fix. Record correctness/test results, grounded citations,
latency, advertised context, and user-observed loading/memory costs. Include an
explicit uncertainty case; do not claim trustworthy routing from one pass.

Keep private repository/session material local unless a specific cloud handoff
is explicitly approved. Reuse only the same nonprivate fixture/prompts for the
comparison, send no hidden local transcript, and record which model ran each
case. Automatic routing, classifiers and virtual-model frameworks remain out of
scope. Actual comparative trials and task recommendations are still pending.

## Local llama.cpp models

Pi 0.81 and later include a dynamic provider for a llama.cpp router. The
router service and single repository-local model cache are documented in the
[llama.cpp guide](../llama/README.md).

Start the router from the host shell, then configure its connection once inside
Pi:

```bash
llm start
```

```text
/login llama.cpp
```

Accept `http://127.0.0.1:8080` and leave the API key blank. Pi stores this
host-local connection in `~/.pi/agent/auth.json`.

Use the model manager for local model operations:

```text
/llama
```

The model manager shows the router's live state:

- Select an unloaded model to load it.
- Select a loaded model to unload it and release its model memory.
- Select **Download model…** to search Hugging Face, choose a repository, and
  choose a quantization. An exact `owner/repository[:quantization]` value can
  also be entered.
- When loading while another model is active, choose whether to unload the
  others or keep multiple models loaded.
- Press Escape during a load or download to confirm cancellation.

After loading a model, select it for the current session:

```text
/model
```

Only loaded llama.cpp models appear in `/model`, using their Hugging Face IDs.

## Themes

Themes are auto-discovered from `~/.pi/agent/themes/*.json`.

Tracked theme:

- `gruvbox-dark` — current default

## Adding more pi resources

Place new resources under `pi/.pi/agent/`, re-stow, and reload pi:

| Directory | What | Auto-discovered? |
|-----------|------|------------------|
| `themes/` | JSON themes | Yes |
| `extensions/` | TypeScript/JavaScript extensions | Yes |
| `skills/` | `SKILL.md` folders or Markdown files | Yes |
| `prompts/` | Markdown prompt templates | Via settings |

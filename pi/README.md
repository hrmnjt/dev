# pi agent package

This directory is my personal package for [pi](https://pi.dev): extensions,
themes, settings defaults, and a custom Gondolin VM image. It is deliberately
small and self-contained.

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
│       │   ├── clipboard-image.ts # Attach host clipboard images before Gondolin
│       │   ├── exit.ts            # Graceful /exit command
│       │   ├── gondolin.ts        # VM sandbox for assistant tools
│       │   ├── review.ts          # Neovim-first diff review command
│       │   ├── review-nvim.lua    # In-memory Neovim review UI
│       │   ├── review-summary.ts  # Model-driven PR review summary
│       │   ├── tldraw.ts          # Authenticated host-local canvas API bridge
│       │   ├── uv.ts              # Prefer uv over pip/poetry/venv
│       │   └── wal-writer.ts      # Append host Obsidian WAL notes
│       ├── gondolin-image.json    # Custom Alpine VM image definition
│       ├── package.json           # Extension dependencies
│       ├── settings.template.json # Intentional settings tracked in git
│       └── themes/
│           └── gruvbox-dark.json
└── README.md
```

Runtime files live under the real host directory `~/.pi/agent` and are
intentionally not tracked:

- `~/.pi/agent/settings.json` — written by pi at runtime
- other host-local files such as `auth.json`, `sessions/`, and `node_modules/`


## The tools and commands

### Gondolin sandbox — `extensions/gondolin.ts`

This is the foundation. It overrides pi's built-in model tools so assistant tool
calls run in a lightweight Alpine VM instead of directly on the host Mac.

Model-facing built-in tools routed through Gondolin:

- `read`
- `write`
- `edit`
- `bash`

These are the only built-in tools enabled by default. Filesystem exploration
uses shell commands such as `rg`, `fd`, and `ls` through the sandboxed `bash`
tool rather than separate Pi `grep`, `find`, or `ls` tools.

The current host project is mounted read/write at `/workspace` inside the VM.
When that workspace contains this repository's host `_models/` cache, only the
cache is shadowed, so it is absent from guest listings and inaccessible to guest
reads and writes. Unrelated repositories do not inherit an `_models/` exclusion.
Pi's documentation and examples are mounted read-only at `/pi/docs` and
`/pi/examples`, so the assistant can inspect pi APIs while building extensions.

Local customizations:

- uses `krun` automatically on Apple Silicon when available, with QEMU as the
  fallback backend
- supports a custom Alpine image through `GONDOLIN_GUEST_DIR`
- excludes this repository's host `_models/` cache without hiding similarly
  named directories in other repositories
- bridges the host SSH agent for GitHub git operations
- generates a VM git config with a fail-closed personal/work identity selected
  from the primary repository path, including linked worktrees stored elsewhere
- marks `/workspace` as a git safe directory
- rewrites the assistant system prompt so it sees `/workspace`, not the host path
- intentionally leaves user-entered pi shell commands (`!` / `!!`) on the host

Command:

```text
/gondolin
```

Shows VM id, host workspace, guest workspace, shell, and mounted docs/examples.

### Caffeinate — `extensions/caffeinate.ts`

This starts macOS `caffeinate` while the agent is working, preventing idle
system sleep while still allowing the display to turn off normally. It stops
when the agent has fully settled and also cleans up during session shutdown.
The assertion is tied to the Pi process so it cannot remain active after a
crash.

The extension runs in the host Pi process rather than through a model-facing
Gondolin tool. It is inactive on non-macOS systems and reports only unexpected
`caffeinate` failures.

### Clipboard image attachment — `extensions/clipboard-image.ts`

Pi's `Ctrl+V` image handling stores clipboard bytes in a host temporary file
and inserts that path into the editor. Gondolin-routed tools cannot read the
host temporary directory. This extension intercepts interactive input containing
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

Use a model that advertises image input. No Gondolin mount or project-local
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
directory real. For linked checkouts, Gondolin mounts the primary repository's
common Git directory at its original absolute path and uses it for identity
selection. Herdr worktrees under `~/.herdr/worktrees` can therefore use Git and
inherit the identity of their primary work or personal repository.

The optional Herdr agent skill is not installed: model-facing shell commands run
inside Gondolin and cannot directly access the host Herdr CLI or socket.

The normal layout uses one default Herdr session, one workspace per repository
worktree, and two full-screen tabs per workspace: `pi` and `shell`. Worktree
creation, shortcuts, explicit `origin/main` branching, and cleanup are documented
in the [Herdr package guide](../herdr/README.md).

### Answer extractor — `extensions/answer.ts`

Sometimes the assistant ends with a list of questions. `/answer` turns that into
a focused interactive Q&A flow.

It finds the most recent complete assistant message, asks the current model to
extract questions as structured JSON, then opens a terminal UI with one answer
box per question. When submitted, the collected answers are sent back into the
conversation as a normal user message.

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
configuration, including the Stow-deployed LazyVim setup; it does not run inside
Gondolin.

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
rather than silently changing interfaces.

Submitted comments from either UI include an anchor snapshot: file path, hunk,
selected line, line kind, and nearby diff context. The generated message tells pi
to treat the reviewer's feedback as authoritative, use the embedded snippet only
as a locator, inspect the referenced files under `/workspace`, preserve unrelated
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
```

It compares the current branch against `main` by default, tracks the last
reviewed HEAD SHA within the pi process, and on repeated runs asks the model to
verify whether previous comments were addressed before reviewing new commits.

### uv guard — `extensions/uv.ts`

This keeps Python work uv-first. The extension exports command-detection helpers
used by the Gondolin bash wrapper: when the assistant tries common Python tooling
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

The vault is not mounted into Gondolin. The tool runs in the host pi process,
locks the target note, creates a missing daily note from `wal/daily.md` when that
template exists, and appends exactly the Markdown it is given to the end of the
file.

Model-facing tool:

```text
wal_append(text, date?)
```

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
Its host `curl` / `tq` commands cannot run in Gondolin: the guest cannot read
`~/Library/Application Support/tldraw/server.json` or connect to the host's
loopback API. The extension instead exposes four focused model tools in the
host Pi process:

- `tldraw_guide` reads only the app-installed `SKILL.md` so the agent can consult
  the current instructions without mounting host skill files into Gondolin.
- `tldraw_search(code)` calls the local `/api/search` endpoint to discover docs,
  inspect shapes, and read recipes.
- `tldraw_exec(docId, code)` calls `/api/doc/:id/exec` for the explicitly
  selected document. It can change a canvas and execute JavaScript in the app.
- `tldraw_screenshot(docId, size?, mode?, bounds?)` asks the app for a JPEG of a
  selected canvas (or app window) and returns image content directly to a
  vision-capable model. `bounds` optionally crops canvas page coordinates.

The extension reads the app's port and per-launch bearer token on each request;
it sends requests only to `127.0.0.1` at that port, with no arbitrary URL or
host filesystem tool. The token is not mounted into Gondolin. These tools
*do* grant the model control of tldraw documents, so use them only on canvases
you trust. For screenshots the bridge reads only a regular JPEG named for the
selected document inside tldraw's own temp directory, with a 10 MiB limit. It
never returns or accepts a host file path and does not mount that directory
into Gondolin. Screenshot images enter the Pi session and the selected model's
context; avoid capturing private boards with an untrusted provider. The bridge
still does not support durable board-script workspace edits; don't use the
installed skill's host-only shell commands as a workaround. Keep `.tldraw`
archives out of direct edits while open.

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
running tldraw offline app and Pi on the Mac; Gondolin alone cannot simulate it.

### Graceful exit — `extensions/exit.ts`

A tiny command that asks pi to shut down cleanly via `ctx.shutdown()` instead of
exiting the Node process directly.

Command:

```text
/exit
```

## Deploy on the host Mac

Assistant tool calls run in the Gondolin VM, so deployment commands must be run
in a normal host terminal:

```bash
cd ~/code/github.com/hrmnjt/dev
just stowall
npm install --prefix ~/.pi/agent
```

Then run this inside pi:

```text
/reload
```

`--no-folding` keeps directories like `~/.pi` real on the host, so pi and npm can
write runtime files there instead of turning the whole directory into a symlink
to this repo.

## First-time settings setup

`settings.template.json` tracks intentional defaults, including the minimal
built-in tool set (`read`, `write`, `edit`, and `bash`). Pi owns `settings.json`
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

## Custom Gondolin image

The custom VM image adds the tools I expect to have available during agent work:

- `bash`
- `git`
- `ripgrep`
- `jq`
- `fd`
- `nodejs` / `npm`
- `python3`
- `uv`
- `openssh`
- `git`
- `gh`
- `hugo`

Build it on the host Mac:

```bash
just gondolin-image
```

Start pi with the custom image:

```bash
export GONDOLIN_GUEST_DIR="$HOME/.gondolin/custom-image"
```

To add tools, edit `pi/.pi/agent/gondolin-image.json`, rebuild the image, and
restart pi.

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

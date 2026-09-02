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
│       │   ├── review.ts          # Terminal-native diff review UI
│       │   ├── review-summary.ts  # Model-driven PR review summary
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

### Terminal diff review — `extensions/review.ts`

`/review` is a terminal-native code review UI for the current git repository. It
collects a diff, parses files/hunks/line numbers, lets me navigate with keyboard
or mouse, attach comments to lines/hunks, and then sends those comments back to
pi as a structured user message.

Commands:

```text
/review
/review staged
/review unstaged
/review main..HEAD
/review --base main
/review help
```

The review UI is optimized for reading diffs in-place:

- wide terminals show a full-width diff with a two-line current-file header
  (`status + basename + file position/comments`, then `directory + +N/-N`)
- narrow terminals keep a separate file-list tab and diff tab
- diff rows reserve a marker column, show both old/new line numbers in muted
  text, and keep the code indentation aligned
- selected rows use a bright `›` marker instead of inverse video so added/removed
  lines keep their normal colors and indentation
- mouse clicks select files/lines, and the wheel scrolls through the diff

Submitted comments include an anchor snapshot: file path, hunk, selected line,
line kind, and nearby diff context. The generated message tells pi to treat the
reviewer's feedback as authoritative, use the embedded snippet only as a locator,
inspect the referenced files under `/workspace`, preserve unrelated changes,
avoid resurrecting deleted files unless explicitly requested, and summarize how
each comment was addressed.

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
just pi-deps
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

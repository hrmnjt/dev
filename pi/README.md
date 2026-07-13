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
│       │   ├── exit.ts            # Graceful /exit command
│       │   ├── gondolin.ts        # VM sandbox for assistant tools
│       │   ├── notify.ts          # OSC 777 desktop notifications
│       │   ├── review.ts          # Terminal-native diff review UI
│       │   ├── review-summary.ts  # Model-driven PR review summary
│       │   ├── usage.ts           # Token/cost usage tracking
│       │   ├── uv.ts              # Prefer uv over pip/poetry/venv
│       │   └── wal-writer.ts      # Append host Obsidian WAL notes
│       ├── gondolin-image.json    # Custom Alpine VM image definition
│       ├── models.json            # Tracked local/custom model providers
│       ├── package.json           # Extension dependencies
│       ├── settings.template.json # Intentional settings tracked in git
│       └── themes/
│           ├── catppuccin-mocha.json
│           └── gruvbox-dark.json
└── README.md
```

Runtime files are intentionally not tracked:

- `pi/.pi/agent/settings.json` — written by pi at runtime
- `pi/.pi/agent/usage-data/` — local token/cost history
- host-local pi files such as `auth.json`, `sessions/`, and `node_modules/`


## The tools and commands

### Gondolin sandbox — `extensions/gondolin.ts`

This is the foundation. It overrides pi's built-in model tools so assistant tool
calls run in a lightweight Alpine VM instead of directly on the host Mac.

Model-facing tools routed through Gondolin:

- `read`
- `write`
- `edit`
- `bash`
- `ls`
- `find`
- `grep`

The current host project is mounted read/write at `/workspace` inside the VM.
Pi's documentation and examples are mounted read-only at `/pi/docs` and
`/pi/examples`, so the assistant can inspect pi APIs while building extensions.

Local customizations:

- uses `krun` automatically on Apple Silicon when available, with QEMU as the
  fallback backend
- supports a custom Alpine image through `GONDOLIN_GUEST_DIR`
- bridges the host SSH agent for GitHub git operations
- generates a VM git config with a path-based personal/work identity
- marks `/workspace` as a git safe directory
- rewrites the assistant system prompt so it sees `/workspace`, not the host path
- intentionally leaves user-entered pi shell commands (`!` / `!!`) on the host

Command:

```text
/gondolin
```

Shows VM id, host workspace, guest workspace, shell, and mounted docs/examples.

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

### Notifications — `extensions/notify.ts`

This sends an OSC 777 desktop notification when an agent run completes and pi is
waiting for input. The notification title includes a repo/branch/tty label, and
the body contains a short Markdown-stripped summary of the last assistant
message.

Commands:

```text
/notify status
/notify test
/notify on
/notify off
```

Environment knobs:

```text
PI_NOTIFY=0|false|off      disable at startup
PI_NOTIFY_MAX_BODY=220     notification body length
PI_NOTIFY_LABEL=...        override the displayed session label
```

### Usage tracker — `extensions/usage.ts`

This records per-turn token usage and estimated cost from assistant responses to
local JSONL data:

```text
~/.pi/agent/usage-data/usage.jsonl
```

It also reads the old aggregate `usage.json` format for continuity.

Commands:

```text
/usage
/usage today
/usage month
/usage all
```

The summary groups usage by provider and model, including input, output,
cache-read, cache-write, approximate reasoning tokens, turns, and cost.

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
stow --no-folding -t ~ pi
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

`settings.template.json` tracks intentional defaults:

```json
{
  "theme": "gruvbox-dark",
  "defaultThinkingLevel": "medium"
}
```

Pi owns `settings.json` and may update volatile keys such as `defaultModel`,
`defaultProvider`, and `lastChangelogVersion`.

If `settings.json` does not exist yet:

```bash
cp pi/.pi/agent/settings.template.json pi/.pi/agent/settings.json
```

If it already exists and you want to apply the template while preserving other
runtime keys:

```bash
cd pi/.pi/agent
jq -s '.[1] * .[0]' settings.template.json settings.json > tmp && mv tmp settings.json
```

## Local llama.cpp model

`models.json` registers the local llama.cpp server as an OpenAI-compatible pi
provider. The server exposes whichever host-local GGUF is active through the
stable `local-model` alias at `http://127.0.0.1:8080/v1`.

The server, model directory, `llm switch` fzf selector, and launchd setup are
documented in `../_models/README.md`. After selecting and starting a model, open
`/model` and select provider `llama.cpp` and model `local-model`. Pi reloads
`models.json` whenever `/model` is opened, so edits to model metadata do not
require restarting pi.

The tracked entry deliberately uses conservative text-only, non-reasoning
metadata. Update it when the active model needs a larger context, image input,
or model-specific thinking compatibility.

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

Tracked themes:

- `gruvbox-dark` — current default
- `catppuccin-mocha`

## Adding more pi resources

Place new resources under `pi/.pi/agent/`, re-stow, and reload pi:

| Directory | What | Auto-discovered? |
|-----------|------|------------------|
| `themes/` | JSON themes | Yes |
| `extensions/` | TypeScript/JavaScript extensions | Yes |
| `skills/` | `SKILL.md` folders or Markdown files | Yes |
| `prompts/` | Markdown prompt templates | Via settings |

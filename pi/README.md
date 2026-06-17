# pi config

Personal [pi coding agent](https://pi.dev) configuration, deployed to `~/.pi/agent` with GNU stow.

## What is tracked

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
│       │   └── uv.ts              # Prefer uv over pip/poetry/venv
│       ├── gondolin-image.json    # Custom Alpine VM image definition
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
- host-local pi files such as `auth.json`, `sessions/`, `node_modules/`

## Deploy on the host Mac

Assistant tool calls run in a Gondolin VM, so deploy commands must be run in a normal host terminal:

```bash
cd ~/code/github.com/hrmnjt/dev
stow --no-folding -t ~ pi
just pi-deps
```

Then run `/reload` inside pi to hot-reload extension changes.

`--no-folding` keeps directories like `~/.pi` real on the host, so pi and npm can write runtime files there instead of turning the whole directory into a symlink to this repo.

## First-time settings setup

`settings.template.json` tracks intentional defaults:

```json
{
  "theme": "gruvbox-dark",
  "defaultThinkingLevel": "medium"
}
```

Pi owns `settings.json` and may update volatile keys such as `defaultModel`, `defaultProvider`, and `lastChangelogVersion`.

If `settings.json` does not exist yet:

```bash
cp pi/.pi/agent/settings.template.json pi/.pi/agent/settings.json
```

If it already exists and you want to apply the template while preserving other runtime keys:

```bash
cd pi/.pi/agent
jq -s '.[1] * .[0]' settings.template.json settings.json > tmp && mv tmp settings.json
```

## Gondolin sandbox

`gondolin.ts` redirects assistant `read`/`write`/`edit`/`bash`/`ls`/`find`/`grep` tool calls into a lightweight Alpine VM.

Inside the VM:

- the current project is mounted at `/workspace`
- pi docs/examples are mounted at `/pi/docs` and `/pi/examples`
- assistant shell commands are sandboxed
- user-entered pi shell commands (`!` / `!!`) still run on the host
- git works via a generated VM git config and host SSH agent bridge

### Custom VM image

The custom image includes common development tools (`bash`, `git`, `ripgrep`, `jq`, `fd`, `node`, `npm`, `python3`, `uv`, `openssh`, etc.). Build it on the host:

```bash
just gondolin-image
```

Then set this before starting pi:

```bash
export GONDOLIN_GUEST_DIR="$HOME/.gondolin/custom-image"
```

To add tools, edit `pi/.pi/agent/gondolin-image.json`, rebuild with `just gondolin-image`, and restart pi.

## Extensions

- `/answer` — extracts questions from the last assistant message into an interactive Q&A UI. Also supports `ctrl+.`.
- `/exit` — cleanly shuts down pi via `ctx.shutdown()`.
- `/gondolin` — shows VM status, shell path, workspace, and docs/example mounts.
- `/notify test|on|off|status` — controls OSC 777 desktop notifications. Set `PI_NOTIFY=0`, `PI_NOTIFY_MAX_BODY`, or `PI_NOTIFY_LABEL` to customize.
- `/review` — terminal diff review UI for working tree changes. Supports `staged`, `unstaged`, ranges, and `--base <branch>`; submitted comments are sent back to pi.
- `/review-summary [base]` — asks the model for a structured review summary against `main` or another base branch.
- `/usage [today|month|all]` — shows token and estimated cost totals from local JSONL usage data.
- `/uv-help` — quick uv reference. The Gondolin bash wrapper blocks common `pip`, `poetry`, `python -m pip`, `python -m venv`, and `python -m py_compile` commands and suggests uv alternatives.

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

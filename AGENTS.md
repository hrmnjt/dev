# Pi Development Context

This repo contains personal dotfiles, including configuration for the [pi coding agent](https://pi.dev).

## Critical: VM vs host boundary

Assistant `read`, `write`, `edit`, and `bash` tool calls run inside a **Gondolin micro-VM** (Alpine Linux), not directly on the host Mac. The repo is mounted at `/workspace` in the VM.

User-entered pi shell commands (`!` / `!!`) intentionally still run on the host, so the user can run host-only commands such as `brew`, `stow`, and VPN tooling.

Do **not** try to run these from assistant tools:

| Command | Why it fails | What to do instead |
|---------|--------------|--------------------|
| `stow` | Not installed in VM | Print the host command for the user |
| `brew` | macOS-only | Print the host command for the user |
| `npm install` in `~/.pi/agent` | VM `~` is not host `~` | Tell the user to run `just pi-deps` on the host |

`npm install` inside `/workspace` is fine. Only host paths such as `~/.pi/agent` are outside the VM.

## Deploying pi changes

After editing pi config, tell the user to run this on the host Mac:

```bash
cd ~/code/github.com/hrmnjt/dev   # adjust if the repo is elsewhere
stow --no-folding -t ~ pi
just pi-deps                       # runs: npm install --prefix ~/.pi/agent
```

Then tell the user to run `/reload` in pi.

Use `--no-folding` so directories such as `~/.pi` remain real host directories while tracked files/directories are symlinked into them.

## Git workflow

When the user asks you to create a branch or commit, use Conventional Commits-style naming.

Branch pattern:

```text
<type>/<scope>/<short-kebab-description>
```

Examples:

```text
feat/pi/new-feature
fix/nvim/random-issue
chore/pi/cleanup
docs/pi/update-readme
chore/meta/repo-wide-change
```

Commit pattern:

```text
<type>(<scope>): <short imperative summary>
```

Examples:

```text
feat(pi): add review command
fix(nvim): correct keymap
docs(pi): update setup notes
chore(meta): update repo guidance
```

Use scopes such as `pi`, `nvim`, or `meta`.

## Pi docs in the VM

Pi docs and examples are mounted in the VM:

- `/pi/docs/`
  - `extensions.md`
  - `tui.md`
  - `themes.md`
  - `skills.md`
  - `prompt-templates.md`
  - `keybindings.md`
  - `models.md`
  - `sdk.md`
- `/pi/examples/`
  - `extensions/`

When asked to build or modify pi extensions, themes, skills, prompts, keybindings, models, SDK integrations, or TUI components, read the relevant docs/examples first and follow linked docs as needed.

## Pi repo structure

```text
pi/
├── .pi/
│   └── agent/
│       ├── extensions/
│       │   ├── answer.ts          # User-initiated Q&A extraction
│       │   ├── exit.ts            # Graceful terminal exit
│       │   ├── gondolin.ts        # Gondolin VM sandboxing
│       │   ├── notify.ts          # Desktop notifications
│       │   ├── review.ts          # Terminal-native diff review UI
│       │   ├── review-summary.ts  # Model-driven PR review summary
│       │   ├── usage.ts           # Token/cost tracking
│       │   └── uv.ts              # uv guidance and Python-tool blocking
│       ├── gondolin-image.json    # Custom VM image config
│       ├── package.json           # Extension dependencies
│       ├── settings.template.json # Intentional settings tracked in git
│       ├── settings.json          # Runtime settings, gitignored
│       ├── usage-data/            # Usage data, gitignored
│       └── themes/
│           ├── catppuccin-mocha.json
│           └── gruvbox-dark.json
└── README.md
```

## Settings management

| File | Tracked? | Purpose |
|------|----------|---------|
| `settings.template.json` | Yes | Intentional defaults (`theme`, `defaultThinkingLevel`) |
| `settings.json` | No | Runtime state written by pi (`defaultModel`, `defaultProvider`, `lastChangelogVersion`, etc.) |

Current intentional defaults:

- theme: `gruvbox-dark`
- default thinking level: `medium`

First-time setup if no runtime settings exist:

```bash
cp pi/.pi/agent/settings.template.json pi/.pi/agent/settings.json
```

Merge template into an existing runtime settings file while preserving other runtime keys:

```bash
cd pi/.pi/agent
jq -s '.[1] * .[0]' settings.template.json settings.json > tmp && mv tmp settings.json
```

When adding a new intentional setting, add it to `settings.template.json`.

## Growing the pi config

Add resources under `pi/.pi/agent/`:

| Directory | What | Auto-discovered? |
|-----------|------|------------------|
| `themes/` | JSON themes | Yes |
| `extensions/` | TypeScript/JavaScript modules | Yes |
| `skills/` | `SKILL.md` folders or Markdown files | Yes |
| `prompts/` | Markdown prompt templates | Via settings |

After adding files, tell the user to deploy with `stow --no-folding -t ~ pi`, run `just pi-deps` if dependencies changed, and run `/reload` in pi.

## Extension development guidelines

1. Use `ctx.shutdown()` for exit; never `process.exit()` because it can corrupt terminal state.
2. Read `/pi/docs/extensions.md` before changing extension APIs.
3. Read `/pi/docs/tui.md` and examples before changing TUI code.
4. Prefer imports from `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` for new code.
5. Some features only work interactively; ask the user to test commands/UI in pi when needed.

## Existing pi extensions

- `answer` — `/answer`; extracts questions from the previous assistant message into an interactive Q&A UI.
- `exit` — `/exit`; gracefully exits pi.
- `gondolin` — sandboxes assistant tools in a VM; mounts workspace at `/workspace` and pi docs/examples at `/pi`.
- `notify` — `/notify test|on|off|status`; desktop notifications via OSC 777.
- `review` — `/review`; TUI for reviewing git diffs and sending comments back to pi.
- `review-summary` — `/review-summary [base]`; model-driven review summary with rubric.
- `usage` — `/usage [today|month|all]`; local token and cost summaries.
- `uv` — `/uv-help`; blocks common pip/poetry/venv commands in Gondolin bash and suggests uv alternatives.

## Gondolin notes

The custom VM image is defined in `pi/.pi/agent/gondolin-image.json` and currently includes common dev tools such as `bash`, `git`, `ripgrep`, `jq`, `fd`, `nodejs`, `npm`, `python3`, `uv`, and `openssh`.

Build it on the host Mac:

```bash
just gondolin-image
```

Then start pi with:

```bash
export GONDOLIN_GUEST_DIR="$HOME/.gondolin/custom-image"
```

Git works inside the VM when the custom image is active. The extension generates a VM-specific git config based on the host path, mounts it at `/root/.config/git`, sets `/workspace` as a safe directory, and proxies SSH via the host `SSH_AUTH_SOCK` for GitHub operations.

Identity selection is fail-closed:

| Host path prefix | Identity |
|------------------|----------|
| `~/code/github.com/hrmnjt/` | Personal |
| `~/code/work/` | Work |
| Anything else | No identity; commits fail clearly |

To change identity rules, edit `GIT_IDENTITY_RULES` in `pi/.pi/agent/extensions/gondolin.ts`.

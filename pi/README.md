# pi config

Personal [pi coding agent](https://pi.dev) configuration, deployed via GNU stow.

## Structure

```
pi/
├── .pi/
│   └── agent/
│       ├── extensions/
│       │   ├── answer.ts       # User-initiated Q&A extraction
│       │   ├── exit.ts         # Graceful terminal exit
│       │   └── gondolin.ts     # Gondolin VM sandboxing
│       ├── gondolin-image.json # Custom VM image build config
│       ├── package.json        # Extension dependencies
│       ├── settings.template.json   # Intentional settings (tracked)
│       ├── settings.json       # Runtime settings (gitignored)
│       └── themes/
│           └── catppuccin-mocha.json
└── README.md
```

## Deploy

```bash
# From repo root
stow -t ~ pi

just pi-deps

# Install QEMU (fallback backend for Gondolin)
brew install qemu   # macOS
```

This symlinks into `~/.pi/agent/`:
- `settings.json` → `pi/.pi/agent/settings.json`
- `themes/` → `pi/.pi/agent/themes/`
- `extensions/` → `pi/.pi/agent/extensions/`
- `package.json` → `pi/.pi/agent/package.json`

Machine-local files (`auth.json`, `sessions/`, `git/`, `node_modules/`) stay
untouched in `~/.pi/agent/`.

## Git clean filter

Pi auto-updates `lastChangelogVersion` in `settings.json` after updates.
Since `settings.json` is symlinked, those changes show up in `git diff`.

A git clean filter strips this field before every commit, so your repo
stays clean while pi can still mutate the working copy:

```bash
# Already configured in .git/config and pi/.pi/agent/.gitattributes
# Verify it's active:
git check-attr filter pi/.pi/agent/settings.json
# → pi/.pi/agent/settings.json: filter: pi-settings
```

The filter uses `pi/.pi/agent/settings-clean.py` — a small Python script
that removes `lastChangelogVersion` and outputs valid JSON.

## Extensions

### answer

Extract and answer questions from the last assistant message. Inspired by [mitsuhiko's answer.ts](https://github.com/mitsuhiko/agent-stuff/blob/main/extensions/answer.ts).

**When to use it:** The assistant asks questions in its response (e.g., "What port should I use? Should I add tests?").

**How to use it:**
1. After an assistant message with questions, type `/answer`
2. Pi extracts the questions using the current model (shows a brief loader)
3. An interactive Q&A UI appears:
   - **Tab / Shift+Tab** — navigate between questions
   - **↑ / ↓** — navigate when the editor is empty
   - **Shift+Enter** — insert a newline in the answer
   - **Enter** — move to the next question (or confirm on the last)
   - **Esc** — cancel
4. Your compiled answers are sent back as a user message

**Example conversation:**
```
Model: I can set this up for you. What port should the server run on?
       Should I add tests? What test framework do you prefer?

You: /answer
     [Q&A UI appears]
     Q1: What port should the server run on?  → 8080
     Q2: Should I add tests?                  → yes
     Q3: What test framework do you prefer?   → vitest
     [Enter to submit]

Model: [continues with port 8080, vitest tests]
```

**Limitation:** Works in interactive mode only.

---

### exit

Gracefully exit pi with `/exit`. Restores terminal state before quitting to
avoid the raw-mode corruption that happens with `Ctrl+C` or `process.exit()`.

**When to use it:** Any time you want to cleanly quit pi.

**How to use it:**
1. Type `/exit` in the pi input
2. pi shuts down gracefully, restoring your terminal

**Why this exists:**
The built-in way to quit pi is `Ctrl+D` or `Ctrl+C`, but these can leave the
terminal in raw mode, causing garbled output on subsequent shell input. This
extension uses `ctx.shutdown()` for a clean exit.

---

### Gondolin

Sandboxes pi's `read`/`write`/`edit`/`bash` tools inside a lightweight Alpine
Linux micro-VM. Based on the [official example](https://github.com/earendil-works/gondolin/blob/main/host/examples/pi-gondolin.ts).

**Prerequisites:**
- QEMU installed (`brew install qemu`) — fallback backend
- `@earendil-works/gondolin` installed (`cd ~/.pi/agent && npm install`)

**What it does:**
- Starts a Gondolin VM on each pi session
- Mounts your project directory at `/workspace` inside the VM
- Redirects all file and shell tool operations into the sandbox
- Runs user `!` commands inside the VM too
- Patches the system prompt so the model sees `/workspace` paths

**Custom VM image:**

The default Alpine VM image lacks `git` and other dev tools. A custom image
with pre-installed packages is configured in `gondolin-image.json`.

```bash
# One-time build (requires lz4 and e2fsprogs from Brewfile)
just gondolin-image
```

This produces `~/.gondolin/custom-image/` (~200MB), pointed to by the
`GONDOLIN_GUEST_DIR` env var. The extension reads this var and passes it
to `VM.create()` — falling back to the default Alpine image if unset.

```bash
# Add to ~/.zshrc for persistence
export GONDOLIN_GUEST_DIR="$HOME/.gondolin/custom-image"
```

**Adding tools to the VM:**

Edit `gondolin-image.json` → `rootfsPackages`, add Alpine package names,
then rebuild:

```bash
just gondolin-image
```

Restart pi to use the new image. No extension changes needed.

**Performance on Apple Silicon:**

On M1/M2/M3/M4 Macs, the extension auto-selects the **krun** backend (Apple
Virtualization.framework) instead of QEMU. This is ~5-10x faster for VM boot
and noticeably snappier for file operations.

If krun is unavailable, it falls back to QEMU automatically.

**Usage:** Just start `pi` in any project directory. The VM starts automatically.

```bash
cd /path/to/your/project
pi
# Gondolin VM ready. Host /path/to/your/project mounted at /workspace
```

## Theme: catppuccin-mocha

Matches my Ghostty terminal (Catppuccin Mocha). Themes are auto-discovered by
pi from `~/.pi/agent/themes/*.json`.

## Growing this config

Add more resources under `pi/.pi/agent/` and re-stow:

| Directory | What | Auto-discovered? |
|-----------|------|-----------------|
| `themes/` | JSON theme files | Yes |
| `extensions/` | TypeScript `.ts`/`.js` modules | Yes |
| `skills/` | `SKILL.md` folders or `.md` files | Yes |
| `prompts/` | `.md` prompt templates | Via `settings.json` |

Run `/reload` in pi to hot-reload extension changes.

## Settings management

Pi writes volatile values (`defaultModel`, `defaultProvider`,
`lastChangelogVersion`) to `settings.json` — these change with every model
switch and update. Only intentional settings (`theme`, `defaultThinkingLevel`)
are tracked in `settings.template.json`.

### First-time setup (or after cloning)

```bash
# Merge template into settings.json (overriding volatile keys)
cd pi/.pi/agent
jq -s '.[0] * .[1]' settings.template.json settings.json > tmp && mv tmp settings.json
```

Alternatively, if no `settings.json` exists yet, just copy the template:

```bash
cp pi/.pi/agent/settings.template.json pi/.pi/agent/settings.json
```

### How it works

- `settings.template.json` — tracked in git, defines intentional defaults
- `settings.json` — **gitignored**, pi writes whatever it wants here
- On setup, `jq` merges template → settings (template takes priority)
- `lastChangelogVersion`, `defaultModel`, etc. evolve naturally without dirtying git

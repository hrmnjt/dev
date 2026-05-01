# pi config

Personal [pi coding agent](https://pi.dev) configuration, deployed via GNU stow.

## Structure

```
pi/
├── .pi/
│   └── agent/
│       ├── extensions/
│       │   ├── answer.ts       # User-initiated Q&A extraction
│       │   └── gondolin.ts     # Gondolin VM sandboxing
│       ├── package.json        # Extension dependencies
│       ├── settings.json       # pi global settings
│       ├── settings-clean.py   # Git clean filter script
│       ├── .gitattributes      # Git filter config
│       └── themes/
│           └── catppuccin-mocha.json
└── README.md
```

## Deploy

```bash
# From repo root
stow -t ~ pi

# Install extension dependencies
cd ~/.pi/agent && npm install

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

## Note on settings.json

Pi auto-updates `lastChangelogVersion` in `settings.json` after updates.
The git clean filter strips this field before commits (see above).
Other settings changes (theme, model, etc.) should be committed normally.

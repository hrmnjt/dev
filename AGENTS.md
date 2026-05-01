# Pi Development Context

This repository contains personal configuration for the [pi coding agent](https://pi.dev).
When working on pi extensions, themes, or settings in this repo, the following
context applies.

## ⚠️ Critical: VM vs Host Boundary

All `read`, `write`, `edit`, and `bash` tool calls execute inside a **Gondolin
micro-VM** (Alpine Linux), not directly on the host Mac. The project directory
is mounted at `/workspace` inside the VM.

**The following commands DO NOT WORK inside the VM.** If you need to run them,
print them for the user to execute manually on their host Mac:

| Command | Why it fails | What to do instead |
|---------|-------------|-------------------|
| `stow` | Not installed in VM | Print the stow command for the user to run on host |
| `git` | Not installed in VM | Print git commands for the user to run on host |
| `npm install` in `~/.pi/agent` | `~` is the VM's root, not the host's | Tell user to run `cd ~/.pi/agent && npm install` on host |
| `brew` | macOS-only, not in VM | Print brew commands for the user to run on host |

**Example workflow when editing extensions:**
1. Edit files in `/workspace/pi/.pi/agent/extensions/` (this works in VM)
2. Tell the user: *"Run this on your host to deploy changes:"*
   ```bash
   cd ~/code/github.com/hrmnjt/dev   # or wherever this repo is cloned
   stow -t ~ pi
   cd ~/.pi/agent && npm install
   ```
3. Tell the user to run `/reload` in pi to hot-reload extensions.

## Pi Documentation Inside the VM

Pi's own documentation and example extensions are auto-mounted inside the VM at:

- `/pi/docs/` — Full API documentation
  - `/pi/docs/extensions.md` — Extension API (`registerCommand`, `registerTool`, events)
  - `/pi/docs/tui.md` — TUI component API (`Component`, `Editor`, `Key`, etc.)
  - `/pi/docs/themes.md` — Theme JSON format
  - `/pi/docs/skills.md` — Skill format and frontmatter
  - `/pi/docs/prompt-templates.md` — Prompt template system
  - `/pi/docs/keybindings.md` — Keybinding definitions
  - `/pi/docs/models.md` — Model/provider configuration
  - `/pi/docs/sdk.md` — SDK for building tools and sessions

- `/pi/examples/` — Working example extensions
  - `/pi/examples/extensions/` — Example `.ts` extensions (custom providers, UI components, etc.)

**Always reference these when asked to build or modify pi extensions, themes, or skills.**
The model can `read` these files directly — they are live files from the pi
version currently installed on the host.

## Repository Structure

```
pi/
├── .pi/
│   └── agent/
│       ├── extensions/
│       │   ├── answer.ts       # User-initiated Q&A extraction
│       │   ├── exit.ts         # Graceful terminal exit
│       │   └── gondolin.ts     # Gondolin VM sandboxing
│       ├── package.json        # Extension dependencies
│       ├── settings.json       # pi global settings
│       └── themes/
│           └── catppuccin-mocha.json
└── README.md
```

## Deploying Changes

Since `stow` and `git` are unavailable in the VM, **print these commands for the
user to run on their host** after making changes:

```bash
# Deploy config changes (symlink into ~/.pi/agent)
cd ~/code/github.com/hrmnjt/dev   # adjust path as needed
stow -t ~ pi

# Install/update extension dependencies
cd ~/.pi/agent && npm install
```

Then tell the user to type `/reload` in pi to hot-reload extensions.

## Extension Development Guidelines

When writing new extensions or modifying existing ones:

1. **Use `ctx.shutdown()` for exit** — Never `process.exit()`, it corrupts the terminal
2. **Read pi docs first** — `read /pi/docs/extensions.md` for the full API
3. **Look at examples** — `read /pi/examples/extensions/` for patterns
4. **Test in interactive mode** — Some features (commands, UI) only work interactively
5. **Import from `@mariozechner/pi-coding-agent`** — This is the main SDK package
6. **Import from `@mariozechner/pi-tui`** — For TUI components (`Key`, `Component`, etc.)

## Existing Extensions

### answer
Extracts questions from the last assistant message into an interactive Q&A UI.
Usage: `/answer` after assistant asks questions.

### exit
Gracefully exits pi using `ctx.shutdown()`. Avoids terminal corruption.
Usage: `/exit`

### gondolin
Sandboxes all tool operations inside a lightweight VM. Mounts workspace and
pi docs/examples. This is the extension you're currently inside.

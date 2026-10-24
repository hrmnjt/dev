# Rex configuration

## TODO

- [ ] Install Rex through Homebrew when an official package is available.
  During preview, install the manually downloaded DMG.
- [ ] Move manual configuration below to supported configuration once stable:
  - Theme import, font, smoothing, and ligatures.
  - Text contrast, application colors, and sRGB.
  - Clipboard, split sizing, and pane focus.
  - Terminal/program notifications and sounds.

## 1. Deploy

From this repository:

```bash
just stowall
```

This links `init.lua`, `worktrees.lua`, and `themes/gruvbox-dark-hard` into
`~/.config/rex/`. Review/merge any existing `init.lua` before deploying. Stow
does not refresh Rex. Check and reload the Lua configuration from a Rex terminal:

```bash
rex config check
rex --autostart=false config reload
```

## 2. Set terminal preferences

**Quit Rex with `Cmd-Q`**, then run these from Ghostty or another terminal.
Alternatively, choose the same values in Rex Settings. These native keys were
checked in Beta 0.1.0 (1347); revisit them after upgrades.

```bash
# JetBrains Mono Nerd Font, 18 pt; the font cask is already in Brewfile.
defaults write com.superlogical.rex Workspace.terminalFontName \
  -string 'JetBrainsMono Nerd Font Mono'
defaults write com.superlogical.rex Workspace.terminalFontPointSize -float 18
defaults write com.superlogical.rex Workspace.terminalFontSmoothing -bool true
defaults write com.superlogical.rex Workspace.terminalAllowsLigatures -bool true

# Improve contrast, preserve Pi/Neovim colors, and use sRGB rather than P3.
defaults write com.superlogical.rex Workspace.terminalImproveTextContrast -bool true
defaults write com.superlogical.rex Workspace.terminalUseThemePalette -bool false
defaults write com.superlogical.rex Workspace.terminalUsesDisplayP3 -bool false

# Keep the clipboard intact; balance splits; click to focus panes.
defaults write com.superlogical.rex Workspace.terminalCopyOnSelect -bool false
defaults write com.superlogical.rex Workspace.balancesSplitsOnCreation -bool true
defaults write com.superlogical.rex Workspace.focusFollowsMouse -bool false

# Allow notifications without Rex's extra program-activity sounds.
defaults write com.superlogical.rex Workspace.allowsTerminalNotifications -bool true
defaults write com.superlogical.rex Workspace.showsProgramActivityNotifications -bool true
defaults write com.superlogical.rex Workspace.playsProgramActivitySounds -bool false
```

Reopen Rex. Choose the font's **Regular** face in Settings and reset any
pane-specific font zoom. Notifications need macOS permission and a program
that reports activity; these settings do not install agent hooks.

## 3. Import the theme

With Rex open and its CLI on PATH:

```bash
rex --autostart=false do client.appearance.switch_mode mode=dark
rex --autostart=false do client.theme.import \
  "path=$HOME/.config/rex/themes/gruvbox-dark-hard"
```

Or import that file in **Settings → Themes** as a Ghostty theme. With multiple
clients, use `rex client ls` and add `-C <client-label-or-id>` before `do`.
If a selection override remains, set background `#3c3836`, foreground `#fbf1c7`.

## 4. Worktree workflow

Requires a local Rex terminal and Git/`fzf` on the login shell's PATH (`fzf`
is already in Brewfile). Both configuration and workflow use Rex's built-in
Lua runtime and native session APIs; no Python, standalone Lua, Herdr, agent
hooks, or `jq` are needed. Enable Rex's **Remote Control** permission for
script-driven session selection.

Each action is one shortcut, and is also listed under **Worktrees** in the
command palette (**Cmd+Shift+P**):

| Key | Action |
| --- | --- |
| **Cmd+Shift+N** | Enter a new Git branch name; create it from **local `main`**, then create its worktree and open a session. No fetch. |
| **Cmd+Shift+O** | Search existing worktrees and local branches with `fzf`; focus an open session, reopen a closed one, or create the missing worktree/session. |
| **Cmd+Shift+Backspace** | Confirm stopping all programs in the current session and removing its worktree. Keep the branch. |

Rex handles Cmd shortcuts itself, so every Ctrl key still reaches the shell,
Neovim, and Pi. Switch between open worktree sessions with Rex's own **Cmd+K**
session picker. A binding replaces any Rex default on the same key, and
`rex keymap` lists only configured bindings, not the app's defaults. Before
the first reload, press each shortcut in a plain shell to confirm Rex does
nothing with it; if one is taken, pick another key in `init.lua`.

For example, branch `feature-a` in `dev` gets sibling directory
`../dev-feature-a` and session `dev-feature-a`. Branch names are preserved;
`feat/rex/example` produces directory/session name `dev-feat-rex-example`.
Generated names flatten `/`, `.`, and other punctuation to hyphens. Directory
collisions are errors, never overwrites. Every new worktree session has **one
ordinary shell tab**, with no tab naming, Pi startup, or extra tabs.

All prompts use fzf in a temporary, single-tab menu session, which closes afterward.
The Open picker distinguishes `[worktree; session open]`, `[worktree; session closed]`,
and `[branch only; create worktree]`, and shows existing checkout paths. Type to
search, use arrows and Enter to select, or Esc/Ctrl+C to cancel. A blank new-branch
prompt cancels too. Delete defaults to **Cancel**; the affirmative choice warns
that **all programs in the source session will stop**. It does not return to main.
Errors are printed in full in the menu terminal and wait for Enter before it
closes, including when fzf itself fails.

Safety and recovery:

- Derive the repository from the focused terminal's actual process directory;
  never hardcode this dotfiles checkout. Remote terminal actions are refused.
- Never delete the primary checkout, even if its branch is not `main`. Refuse
  modified/staged/untracked files, locked worktrees, and submodule worktrees;
  never use `--force` or delete a branch. Ignored files follow normal Git
  worktree-removal behavior.
- Find sessions by their terminals' directories and reuse them by ID, not
  label, so renaming a session is harmless. No session map is saved: a session
  whose terminals have all left the worktree no longer counts, and Open starts
  a new one. Refuse ambiguous duplicate sessions rather than create another.
  New/Open discovery skips inaccessible sessions and terminal directories rather
  than blocking other projects. Deletion still strictly refuses a source session
  with unknown, remote, inaccessible, or unrelated terminal directories.
- Check cleanliness and submodules before confirmation and again before stopping
  programs. Then stop the source session **before** asking Git to remove the
  checkout, without `--force`. Git's removal checks protect files written during
  shutdown and newly locked worktrees. If Git refuses, the checkout and branch
  remain, though the session may already be closed. Use Open (**Cmd+Shift+O**) to reopen it.
  A session-creation failure likewise leaves a recoverable worktree.
- Nothing is saved outside Git and Rex. This is **not** session save/restore: a Rex server restart still ends its
  sessions. Open recreates a plain shell session for an existing worktree.
  Git remains the source of truth for worktrees and branches.

### Walkthrough

This tries every action once on a real task, a branch for Pi notifications. It
is also the end-to-end check that the automated tests below cannot cover: real
shortcuts, fzf in a Rex terminal, and stopping programs.

1. In a plain Rex shell, press **Cmd+Shift+N**, **Cmd+Shift+O**, and
   **Cmd+Shift+Backspace**; Rex itself should not open anything. Then deploy
   and reload as in [Deploy](#1-deploy). **Ctrl+B** now moves the shell cursor
   back one character instead of starting a key sequence.
2. In a shell in `~/code/github.com/hrmnjt/dev`, press **Cmd+Shift+N**, type
   `feat/pi/add-rex-status`, and press Enter. Session
   `dev-feat-pi-add-rex-status` opens with one shell tab in
   `../dev-feat-pi-add-rex-status`, on a new branch from local `main`. Check
   with `git status -sb`.
3. Press **Cmd+K** and choose `dev` to return to the primary checkout. From
   there, press **Cmd+Shift+O**: the branch shows as `[worktree; session open]`,
   and choosing it focuses the same session.
4. Close that session with `rex kill dev-feat-pi-add-rex-status`, which stops
   everything in it. From `dev`, press **Cmd+Shift+O** again and choose the
   branch, now `[worktree; session closed]`. A fresh shell session opens in
   the same checkout.
5. Start `pi` there and work as usual. Extra tabs are fine while they stay
   inside the worktree; Delete refuses sessions with terminals elsewhere.
6. In the worktree, run `touch scratch` and press **Cmd+Shift+Backspace**. The
   menu refuses the untracked file without stopping anything. Press Enter,
   then `rm scratch`.
7. When the branch has merged, or to end a trial run, press
   **Cmd+Shift+Backspace** in the worktree and choose **Remove worktree and
   STOP ALL programs in its Rex session**. The session closes and the checkout
   is removed. The branch stays; delete it from `dev` with
   `git branch -d feat/pi/add-rex-status` once it has merged.

### Checks

With the Rex server running, use Rex's own Lua runtime for disposable real-Git
fixtures and mocked session/client/menu operations (no deployment or Python):

```bash
./_scripts/tests/rex-worktrees.sh
```

It never stops the Rex server or changes real sessions.

To run only the mocked action-wiring checks without Git fixtures:

```bash
rex --autostart=false do ./_scripts/tests/rex-worktrees.lua root="$PWD" --json
```

## After changing something

- **Theme file:** repeat the import; Rex stores a copy rather than watching it.
- **App Settings:** update the preferred values in this README too. They are
  stored in macOS preferences, backed by
  `~/Library/Preferences/com.superlogical.rex.plist`, not tracked here.
  Inspect with `defaults read com.superlogical.rex`; do not edit the plist directly.
- **`defaults` commands:** quit Rex before writing, then reopen. Undo individual
  choices in Settings rather than replacing the whole preference domain.
- **`init.lua`:** edit supported bindings/actions there, then check and reload:

  ```bash
  rex config check
  rex --autostart=false config reload
  ```

- **`worktrees.lua`:** the next menu invocation uses the changed helper; no config
  reload is needed unless its launcher/bindings changed too.

Lua reload does **not** re-import themes or apply native preferences. No
appearance setup script is maintained during beta. Leave unrelated defaults and
security choices app-managed for now.

[Configuration guide](https://www.superlogical.com/rex/docs/customize/config) ·
[Lua API](https://www.superlogical.com/rex/docs/reference/lua) ·
[Shared palette](../GRUVBOX.md)

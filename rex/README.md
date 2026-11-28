# Rex configuration

## Setup

During preview, install Rex from the manually downloaded DMG. From this
repository, deploy the configuration:

```bash
just stowall
```

This links `init.lua`, `worktrees.lua`, and `themes/gruvbox-dark-hard` into
`~/.config/rex/`. Review/merge any existing `init.lua` before deploying.
Then check and reload from a Rex terminal:

```bash
rex config check
rex --autostart=false config reload
```

## Terminal preferences

Choose these values in Rex Settings, or **quit Rex with Cmd+Q** and run the
commands below from another terminal. These native keys were checked in
Beta 0.1.0 (1347); revisit them after upgrades.

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

Reopen Rex. Choose the font's **Regular** face and reset any pane-specific zoom.
These preferences are app-managed, not tracked here; undo individual choices in
Settings rather than replacing the whole preference domain.

## Theme

With Rex open and its CLI on PATH:

```bash
rex --autostart=false do client.appearance.switch_mode mode=dark
rex --autostart=false do client.theme.import \
  "path=$HOME/.config/rex/themes/gruvbox-dark-hard"
```

Or import that file in **Settings → Themes** as a Ghostty theme. With multiple
clients, use `rex client ls` and add `-C <client-label-or-id>` before `do`.
If a selection override remains, set background `#3c3836`, foreground `#fbf1c7`.
Repeat the import after changing the theme file; Rex stores a copy.

## Pi notifications

Pi 1.3.0 reports activity natively through
[OSC 7501](https://www.superlogical.com/rex/docs/build/program-status).
Start ordinary interactive `pi` in Rex; no extra extension or agent hooks are
needed. Rex automatically receives working, waiting-for-input, done, error, and
idle states. Completion is reported only when the full run settles; cancellation
reports idle. Prompts and model output are never included.

Enable terminal/program-activity notifications in Rex and allow notifications
in **macOS System Settings → Notifications → Rex**. To check background delivery,
start a Pi task and switch to another app before it finishes. Live working status
and enabled Rex preferences are verified; background banners remain a manual check.

If activity is missing, run Pi directly in Rex without tmux/screen and check that
`PI_PROGRAM_STATUS` is not `0`.

## Worktrees

Requires a local Rex terminal and Git. **New** and **Open** ask in Rex's
command palette (control API revision 17 or newer), so they need no `fzf`,
menu session or **Remote Control**. **Delete** and **Projects** still choose
with `fzf` (in Brewfile) in a temporary menu session and need Rex's
**Remote Control** permission until they move to the palette too. Actions also
appear under **Worktrees** in the **Cmd+Shift+P** command palette.

Use **one session per project → one tab per worktree → panes for programs**.
Rex's CLI/API calls tabs “windows”; these are not separate macOS windows.

| Key | Action |
| --- | --- |
| **Cmd+Shift+K** | Open a session for every listed project that has none, or type a checkout path to open as a one-off project. Works from any pane. |
| **Cmd+Shift+N** | Type a branch name; track a matching fetched remote branch, otherwise create it from **local `main`**. Open its worktree as a focused tab in the project's session. No fetch. |
| **Cmd+Shift+O** | Pick from the project's worktrees, newest activity first, each with its next step, then local branches without one. Focus its tab, reopen it, or create its worktree. |
| **Cmd+Shift+Backspace** | Confirm stopping all programs in the worktree's tab and removing its checkout. Other tabs stay open. Keep the branch. |
| **Cmd+K** | Switch between Rex sessions. |

Every Ctrl key still reaches the shell, Neovim, and Pi. Custom bindings live in
`init.lua`; `rex keymap` lists configured bindings, not Rex's app defaults.

Worktrees are siblings of the primary checkout: branch `feat/rex/example` in
`dev` gets directory `dev-feat-rex-example` and tab `feat/rex/example` inside
session `dev`. The primary checkout gets a tab named after its branch, usually
`main`. Each new tab starts one ordinary shell; split it into panes as needed.
Pi does not start automatically. Session and tab labels can be renamed: terminal
directories, not labels, identify the project and worktree.

Palette prompts: type to filter or edit, Return to choose, Esc to cancel.
Cancelling, or leaving a prompt unanswered for five minutes, does nothing.
Prompts appear in every connected Rex app, including other devices; the first
answer wins. If no app can show one, or another prompt is already open, the
action stops and Rex shows why.

### New

New matches the full branch name: `feat/example` uses `origin/feat/example`
(or the sole matching remote) and sets it as the upstream. Multiple matching
remotes stop the action instead of guessing or falling back to `main`. Fetch
first if the branch is not known locally.

A blank name does nothing. An invalid name, or one whose worktree directory
already exists, asks again with your text kept and the reason in the title. A
local branch that already exists offers **Open** (its existing tab, or a new
worktree from the branch as it is; never reset) or **Choose another name**.

### Open

Open lists every worktree of the project, then local branches without one.
Each row shows the branch, its last activity and its most urgent next step:

```text
dev worktrees · origin fetched 3 hours ago
feat/app/example                    push 2
  2 hours ago
docs/model/example          Claude waiting
  yesterday
chore/ingestion/example     ready to close
  4 days ago
local-only                     no worktree
  5 days ago
```

- **Activity** is the newest of the worktree's checkouts and commits (its `HEAD`
  reflog), edits to its uncommitted files, and program reports from its tabs.
- **Next step**, most urgent first: `finish rebase` (or merge, cherry-pick,
  revert, bisect, am), `Claude waiting` or `Pi failed` (a program in the
  worktree's tab reported blocked or error), `push N` (ahead of its upstream,
  or never published), `N changed` (uncommitted files), `Pi done`,
  `ready to close`, `rebase N` (`main` has N commits the branch lacks),
  `Claude working`, `locked`, or `missing directory`.
- **Ready to close** means clean, with its upstream deleted or every commit
  already in `main` by patch (`git cherry`), so squash merges count. Branches
  compare with `main`'s upstream when it has one, else local `main`.
- Icons: a terminal for an open tab, a folder for a closed worktree, a branch
  for a branch without one. The title shows the newest `git fetch` from any
  worktree.

Open only reads: it never fetches, and `git status` runs without optional
locks, so not even the index is refreshed. Its Git reads run in parallel, a
few rounds in all rather than one command after another. Return focuses the worktree's tab,
reopens a closed worktree as one shell tab, or creates the worktree for a
branch. Open checks the tabs again after you choose, so a tab opened meanwhile
is focused rather than duplicated.

### Projects

Projects are the checkouts listed in the `projects` table at the top of
`init.lua`; nothing is scanned or recorded at runtime:

```lua
local projects = {
  "~/code/github.com/hrmnjt/dev",
  "~/code/work/doh/some-service",
}
```

List primary checkouts with absolute or `~/` paths, then check and reload.
**Cmd+Shift+K** offers two rows:

- `[all projects]` gives each listed project without a session a plain shell
  session in its primary checkout. A project with any open worktree tab, even
  in a subdirectory or an old session, is left alone, and focus returns to where
  you were. Missing or non-Git entries are reported after the rest open.
- `[path]` asks for an absolute or `~/` path inside a Git checkout, then
  switches to that checkout's tab or opens it in the project's session. The path
  is used once and never added to the list.

From a terminal outside any Git checkout, **Cmd+Shift+N** and **Cmd+Shift+O**
ask for the project first. That list shows open projects first and the current
one last; missing directories are marked `missing`.

### Safety and recovery

- The focused terminal's directory determines the repository; outside Git, New
  and Open use the chosen project. Remote terminals are refused; sessions and
  tabs are found by terminal directory, not label.
- Delete only acts on the focused terminal's own worktree and never offers the
  project picker. It refuses primary, dirty, locked, submodule, and
  mixed-directory tabs, duplicate worktree tabs, and unknown/remote blocks in
  the target tab. It never uses `--force` or deletes a branch. Ignored files
  follow normal Git worktree-removal behavior.
- Delete stops only the target tab's programs **before** Git removes the checkout.
  Sibling tabs and their programs remain untouched. When deleting the last tab,
  it first opens a primary-checkout shell tab to keep the project session usable.
  If Git refuses removal, the checkout and branch remain, but the worktree's tab
  may be closed. Use **Cmd+Shift+O** to reopen it.
- After a Rex server restart, Rex restores sessions and tabs itself. Reopen any
  missing worktree tab from **Cmd+Shift+O**, and missing project sessions with
  **Cmd+Shift+K**.

### Moving from worktree sessions

Existing sessions and running programs are not moved or closed automatically.
Open still focuses existing worktree tabs wherever they are. If several sessions
belong to a project, creating additional tabs stops rather than guessing which
session to use.

For a clean switch, save/finish the programs in the old worktree sessions, then
close those sessions yourself (**closing stops their programs**). Keep the
primary-checkout project session and reopen each missing worktree from
**Cmd+Shift+O** there. If you closed every project session, use **Cmd+Shift+K**
first. This does not delete Git worktrees or branches.

## Checks

Run disposable real-Git fixtures with mocked Rex sessions, tabs, palette
prompts and menus:

```bash
./_scripts/tests/rex-worktrees.sh
```

Requires a running Rex server; it does not change real sessions. Real shortcuts,
palette and `fzf` interaction, tab selection, and tab-only program shutdown
still need interactive verification.

To try a branch's New or Open before deploying it, run its `init.lua` from a
Rex terminal; New and Open then load the `worktrees.lua` beside it, never the
deployed copy:

```bash
rex do ~/code/github.com/hrmnjt/dev-feat-rex-example/rex/.config/rex/init.lua \
  --action worktree_open   # or worktree_new
```

A trial's final tab focus is a client action sent from the CLI, so it needs
**Remote Control** and may need `-C <client>` from `rex client ls`; the
deployed shortcuts need neither.

After editing `init.lua`, including the project list, run `rex config check`
and `rex --autostart=false config reload`. Changes to `worktrees.lua` take
effect the next time an action runs. Lua reload does not apply native
preferences or re-import themes.

[Configuration guide](https://www.superlogical.com/rex/docs/customize/config) ·
[Lua API](https://www.superlogical.com/rex/docs/reference/lua) ·
[Shared palette](../GRUVBOX.md)

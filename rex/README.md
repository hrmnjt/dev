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

Requires a local Rex terminal, Git, and `fzf` on PATH (`fzf` is in Brewfile).
Enable Rex's **Remote Control** permission for script-driven session selection.
Actions also appear under **Worktrees** in the **Cmd+Shift+P** command palette.

| Key | Action |
| --- | --- |
| **Cmd+Shift+K** | Open a session for every listed project that has none, or type a checkout path to open as a one-off project. Works from any pane. |
| **Cmd+Shift+N** | Enter a branch name; track a matching fetched remote branch, otherwise create it from **local `main`**. Open its worktree in a new session. No fetch. |
| **Cmd+Shift+O** | Search worktrees and local branches; focus an open session, reopen a closed one, or create the missing worktree/session. |
| **Cmd+Shift+Backspace** | Confirm stopping all programs in the session and removing its worktree. Keep the branch. |
| **Cmd+K** | Switch between Rex sessions. |

Every Ctrl key still reaches the shell, Neovim, and Pi. Custom bindings live in
`init.lua`; `rex keymap` lists configured bindings, not Rex's app defaults.

Worktrees are siblings of the primary checkout: branch `feat/rex/example` in
`dev` gets directory/session name `dev-feat-rex-example`, and the primary
checkout's own session is named `dev`. New sessions contain one ordinary shell
tab; Pi does not start automatically.

New matches the full branch name: `feat/example` uses `origin/feat/example`
(or the sole matching remote) and sets it as the upstream. Multiple matching
remotes stop the action instead of guessing or falling back to `main`. Fetch
first if the branch is not known locally. Existing local branches are never
reset; use **Cmd+Shift+O** to open them.

Prompts use `fzf` in a temporary menu session. Type to search, use arrows and
Enter to select, or Esc/Ctrl+C to cancel. Errors wait for Enter before closing.

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
  session in its checkout. A project with any open session, even in a
  subdirectory, is left alone, and focus returns to where you were. Missing or
  non-Git entries are reported after the rest open.
- `[path]` asks for an absolute or `~/` path inside a Git checkout, then
  switches to that checkout's session or opens one. The path is used once and
  never added to the list.

From a terminal outside any Git checkout, such as after a Rex restart,
**Cmd+Shift+N** and **Cmd+Shift+O** ask for the project first. That list shows
open projects first and the current one last; missing directories show as
`[missing]`. When two or more worktrees have no session, Open's
`[all worktrees]` row gives each one a plain shell session and focuses the
primary checkout.

### Safety and recovery

- The focused terminal's directory determines the repository; outside Git, New
  and Open use the chosen project. Remote terminals are refused; sessions are
  found by terminal directory, not label.
- Delete only acts on the focused terminal's own worktree and never offers the
  project picker. It refuses primary, dirty, locked, submodule, and
  mixed-directory session checkouts, and never uses `--force` or deletes a
  branch. Ignored files follow normal Git worktree-removal behavior.
- Delete stops the session's programs **before** Git removes the checkout. If Git
  refuses removal, the checkout and branch remain, but the session may be closed.
  Use **Cmd+Shift+O** to reopen it.
- Rex server restarts end sessions. **Cmd+Shift+K** and Open's `[all worktrees]`
  row recreate plain shell sessions for existing checkouts; running programs are
  not restored.

## Checks

Run disposable real-Git fixtures with mocked Rex sessions/menu operations:

```bash
./_scripts/tests/rex-worktrees.sh
```

Requires a running Rex server; it does not change real sessions. Real shortcuts,
`fzf` interaction, and program shutdown still need interactive verification.

After editing `init.lua`, including the project list, run `rex config check`
and `rex --autostart=false config reload`. Changes to `worktrees.lua` take
effect on the next menu invocation. Lua reload does not apply native preferences or
re-import themes.

[Configuration guide](https://www.superlogical.com/rex/docs/customize/config) ·
[Lua API](https://www.superlogical.com/rex/docs/reference/lua) ·
[Shared palette](../GRUVBOX.md)

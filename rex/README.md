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

## Appearance

In the command palette (**Cmd+Shift+P**), run **Apply Appearance Preferences**.
It applies these Rex settings at once, without quitting Rex or needing Remote
Control:

- Dark appearance with the Gruvbox theme from `themes/gruvbox-dark-hard`
  (imported and selected), using the theme's selection colors.
- JetBrainsMono Nerd Font Mono, Regular, 18 pt (the font cask is in
  Brewfile), with smoothing and ligatures.
- Improved text contrast, programs' own colors kept (no forced theme palette)
  so Pi and Neovim look right, and sRGB rather than Display P3.
- No copy on select, balanced splits, click to focus panes.
- Terminal and program-activity notifications on, activity sounds off.

The list lives in the `appearance` table in `init.lua`. Each entry is one of
Rex for Mac's `client.setting.*` actions; list them with their arguments with
`rex -C <app> actions` (`rex client ls` names the app). Run the action again
after changing the table or the theme file, since Rex stores its own copy of
an imported theme. Any choice can still be changed in Settings; reset a
pane-specific zoom there by hand.

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

Requires a local Rex terminal and Git. Every action asks in Rex's command
palette (control API revision 17 or newer), so none needs `fzf`, a menu
session or **Remote Control**. Actions also
appear under **Worktrees** in the **Cmd+Shift+P** command palette.

Use **one session per project → one tab per worktree → panes for programs**.
Rex's CLI/API calls tabs “windows”; these are not separate macOS windows.

| Key | Action |
| --- | --- |
| **Cmd+Shift+K** | Pick a listed project, or type a checkout path; focus its checkout's tab or open it in the project's session. Works from any pane. |
| **Cmd+Shift+N** | Type a branch name; track a matching fetched remote branch, otherwise create it from **local `main`**. Open its worktree as a focused tab in the project's session. No fetch. |
| **Cmd+Shift+O** | Pick from the project's worktrees, newest activity first, each with its next step, then local branches without one. Focus its tab, reopen it, or create its worktree. |
| **Cmd+Shift+Backspace** | Confirm closing the worktree's tab, stopping its programs, and removing its checkout. Other tabs stay open. Keep the branch. |
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
already exists, asks again with your text kept and **Invalid name** or
**Folder exists** as the title. A local branch that already exists offers
**Open** (its existing tab, or a new worktree from the branch as it is; never
reset) or **Choose another name**.

Rex shows a prompt's title inside its text field, so titles stay short; the
project's name is in the placeholder and on the **Create in …** row. The
prompt's width is set by the Rex app; actions can't change it.

### Open

Open, titled **Worktrees**, lists every worktree of the project, then local
branches without one. Each row shows the branch, what kind of row it is, its
last activity, and its most urgent next step:

```text
Worktrees
feat/app/example                     push 2
  tab open · 2 hours ago
main                   fetched 3 hours ago
  tab open · yesterday
chore/ingestion/example      ready to close
  no tab · 4 days ago
local-only                  create worktree
  branch only · 5 days ago
```

- **Kind:** `tab open` (a worktree with a tab), `no tab` (a worktree without
  one), or `branch only` (no worktree yet; Delete keeps branches, so they
  linger here after their worktree is gone).
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
- The primary checkout shows when the project was last fetched (the newest
  `git fetch` from any worktree) when nothing is more urgent.

Open only reads: it never fetches, and `git status` runs without optional
locks, so not even the index is refreshed. Its Git reads run in parallel, a
few rounds in all rather than one command after another. Return focuses the
worktree's tab, reopens a closed worktree as one shell tab, or creates the
worktree for a branch. Open checks the tabs again after you choose, so a tab opened meanwhile
is focused rather than duplicated.

### Delete

Delete asks **Delete**, with **Cancel** first. The other row names the branch,
the project and the checkout's path, and lists what it will stop: foreground
programs in the tab's panes and agents still working or waiting, such as
`stops nvim, Claude (waiting)`. Esc cancels.

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

**Cmd+Shift+K** asks **Project**: listed projects with open sessions first and
the current one last, each marked `session open`, `session closed`,
`current session` or `missing`. Choosing one focuses its primary checkout's tab,
or opens that tab in the project's session (or a new session). Or type an
absolute or `~/` path inside any Git checkout and press Return: Projects
switches to that checkout's tab or opens it the same way. A typed path is used
once and never added to the list.

From a terminal outside any Git checkout, **Cmd+Shift+N** and **Cmd+Shift+O**
ask for the project first, from the same list.

### Safety and recovery

- The focused terminal's directory determines the repository; outside Git, New
  and Open use the chosen project. Remote terminals are refused; sessions and
  tabs are found by terminal directory, not label.
- Delete only acts on the focused terminal's own worktree and never offers the
  project picker. It refuses primary, dirty, locked, submodule, and
  mixed-directory tabs, duplicate worktree tabs, and unknown/remote blocks in
  the target tab. It never uses `--force` or deletes a branch. Ignored files
  follow normal Git worktree-removal behavior.
- Delete closes only the target tab, for real, **before** Git removes the
  checkout; sibling tabs and their programs remain untouched. When deleting the
  last tab, it first opens and focuses a primary-checkout shell tab to keep the
  project session usable. `git worktree remove` runs detached, so it finishes
  even if the action is stopped or the config reloads. If Git refuses removal,
  Delete says why; the checkout and branch remain and the tab is closed, so
  reopen it with **Cmd+Shift+O**.
- **Shift+Cmd+T** (Rex's Undo Close) reopens the pane or tab you closed most
  recently, with its programs, for about a minute. Delete's close can't be
  undone, by design.

### Restart and resume

Rex keeps sessions on its server. After a Rex server restart, Session Restore
brings back every session, tab and pane with its label and directory; nothing
here recreates them. A pane's program comes back only if it reported how to
resume and a rule in `init.lua` trusts it:

- **Pi** resumes in the same session, from Pi releases after 1.6.1, which
  report their resume command themselves.
- **Claude Code** on the Mac resumes in the same conversation once Rex's hook
  is installed with `rex skill setup`. Claude in a Gondolin VM can't report
  (no Mac environment reaches the VM), so it comes back as a shell in its
  worktree; run `claude -c` there.
- Both resume only in projects under `~/code`. Codex, OpenCode, Gemini CLI,
  Copilot CLI and Crush never resume. Every other pane comes back as a shell
  in its folder.

`rex config check` lists the rules in force. To see why a pane's program
didn't resume, run `rex block call -b "$REX_BLOCK" program_resume_records` in
that pane and read its `untrusted_reason`. A missing worktree tab reopens from
**Cmd+Shift+O**, and a missing project session from **Cmd+Shift+K**.

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
palette interaction, tab selection, tab-only program shutdown, and resuming
programs after a restart still need interactive verification.

To try a branch's actions before deploying them, run its `init.lua` from a Rex
terminal; the actions then load the `worktrees.lua` beside it, never the
deployed copy:

```bash
rex do ~/code/github.com/hrmnjt/dev-feat-rex-example/rex/.config/rex/init.lua \
  --action worktree_open   # or worktree_new, worktree_delete, project_switch
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

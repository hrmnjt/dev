# AeroSpace weekly trial plan

> **Temporary plan:** this is my one-week onboarding plan for AeroSpace, not a
> permanent README. It is meant to hook me into tiling window managers and will
> become obsolete after **June 7th**.

AeroSpace is not meant to be a prettier AltTab. The experiment is to stop
searching through windows and start putting windows in predictable workspaces.
macOS Spotlight and the default `cmd-tab` app switcher are enough fallback while
I uninstall AltTab and try this workflow properly.

## Where the config lives

AeroSpace supports XDG config, so this repo uses that instead of
`~/.aerospace.toml`:

```text
repo: aerospace/.config/aerospace/aerospace.toml
home: ~/.config/aerospace/aerospace.toml
```

This folder is stowed into `~`, so deploy from the repo root with:

```bash
cd ~/code/github.com/hrmnjt/dev
just stowall
```

## Setup

Install from the repo Brewfile and deploy the dotfiles:

```bash
just brewinst
just stowall
```

Uninstall AltTab now so the trial is real:

```bash
brew uninstall --cask alt-tab
```

Then launch AeroSpace once and grant Accessibility permissions when macOS asks.

If you edit the config, reload AeroSpace with:

```text
option-shift-r
```

## Shortcut notation

AeroSpace calls the Mac Option key `alt` in config. In this plan:

```text
alt = option / opt / ⌥
```

So `alt-1` means `option-1`, and `alt-shift-r` means `option-shift-r`.

## Configured workflow at a glance

The current config is intentionally small. The important ideas are:

| Workspace / screen | Shortcut | Intended home | Auto-moved apps |
| --- | --- | --- | --- |
| 1 | `option-1` | cmux / agents / shell | cmux |
| 2 | `option-2` | general browser | none; put a Brave window here manually |
| 3 | `option-3` | notes / docs | Obsidian |
| 4 | `option-4` | work comms web window | native Teams if installed; otherwise manual Brave window |

Key behaviors to understand:

- `option-h/j/k/l` focuses windows spatially, like vim movement.
- `option-shift-h/j/k/l` moves the focused window within the layout.
- `option-shift-1..9` sends the focused window to that numbered workspace; `option-shift-0` sends it to workspace 10.
- `option-tab` toggles back to the previous workspace.
- `option-f` uses AeroSpace fullscreen; avoid the green macOS fullscreen button.
- `option-shift-space` toggles a weird window between tiled and floating.
- Finder and System Settings are configured to float because they are usually temporary.

What changed for Obsidian: in `aerospace/.config/aerospace/aerospace.toml`, the
`md.obsidian` `on-window-detected` rule now says
`run = 'move-node-to-workspace 3'`. That is the pattern to reuse later: find the
app id with `aerospace list-apps`, then point its rule at the workspace number
you want.

Work comms setup: AeroSpace cannot reliably route individual Brave tabs by URL.
It manages windows/apps, not "the Outlook tab" inside Brave. So Brave is
intentionally **not** auto-moved in the config. Use `option-4`, open a separate
Brave window there, and keep Outlook Web + Teams Web as pinned tabs in that
window. If the window is elsewhere, move it once with `option-shift-4`. If I
later install Teams/Outlook as standalone web apps/PWAs, I can run
`aerospace list-apps` and add app-id rules for those apps.

## First week plan

### Day 0: install and orient yourself

Goal: make sure AeroSpace runs and remove the AltTab escape hatch.

1. Install and stow the config.
2. Uninstall AltTab.
3. Launch AeroSpace.
4. Confirm these shortcuts work:
   - `option-1` through `option-9`, plus `option-0` for workspace 10: switch workspaces
   - `option-h/j/k/l`: move focus left/down/up/right
   - `option-shift-h/j/k/l`: move the focused window
   - `option-f`: fullscreen the focused window using AeroSpace
   - `option-shift-space`: toggle a window between tiling and floating
   - `option-enter`: open cmux
5. Use Spotlight or macOS `cmd-tab` only as fallback.
6. Avoid the green macOS fullscreen button. Use `option-f` instead.

### Day 1: fixed homes for common work

Goal: build the habit of jumping directly to a known place.

Use the workspace map from the configured workflow section above.

Practice rule for the day: when you want an app, switch to its workspace first.
Do not cycle windows unless you genuinely do not know where the window is.

### Day 2: directional focus only

Goal: replace local window cycling inside a workspace.

When multiple windows are on one workspace:

- use `option-h/j/k/l` to focus neighbors
- use `option-shift-h/j/k/l` to rearrange windows
- use `option-slash` to reset to tiled layout if things get weird
- use `option-f` if one window needs temporary attention

Do not worry about perfect layouts. The win is getting comfortable with
spatial navigation.

### Day 3: moving windows intentionally

Goal: stop dragging windows with the mouse.

Practice:

- `option-shift-1` through `option-shift-9`, plus `option-shift-0`, moves the focused window to a workspace
- `option-shift-h/j/k/l` moves the focused window within the current workspace
- `option-tab` jumps back to the previous workspace

Suggested drill:

1. Open a browser from anywhere.
2. Move it to workspace 2 with `option-shift-2`.
3. Jump to workspace 2 with `option-2`.
4. Move it around with `option-shift-h/j/k/l`.

### Day 4: observe app assignment rules

Goal: let AeroSpace do boring placement for you.

The starter config includes only the app rules I want right now:

- cmux -> workspace 1
- Obsidian -> workspace 3
- native Microsoft Teams, if installed -> workspace 4
- Brave is deliberately not auto-moved, so separate Brave windows can live on
  different workspaces.

Today, notice where new windows land. If an app lands somewhere surprising,
check its app id with:

```bash
aerospace list-apps
```

Then update `aerospace/.config/aerospace/aerospace.toml` in this repo and
reload with `option-shift-r`.

### Day 5: floating exceptions

Goal: learn when *not* to tile.

Some windows are better floating: settings windows, file pickers, small dialogs,
copy/paste helpers, calendar popovers.

Use:

- `option-shift-space`: toggle floating/tiling for the current window
- `option-f`: fullscreen/maximize when you need focus

If a window is always annoying when tiled, add an `on-window-detected` rule for
it and make it floating.

### Day 6: mouse reduction day

Goal: use keyboard navigation for most window management.

Try to avoid these for one work session:

- dragging windows
- resizing by edges
- clicking Dock icons
- window cycling as the first instinct

Use these instead:

- Spotlight to open apps
- `option-1..9` / `option-0` to jump to places
- `option-h/j/k/l` to focus
- `option-shift-1..9` / `option-shift-0` to move windows between workspaces

At the end of the day, write down the two shortcuts that felt awkward. Change
only those if needed.

### Day 7: review and decide

Goal: decide whether AeroSpace is improving your workflow.

Ask:

- Did I rely less on window cycling?
- Can I predict where my main apps are?
- Are workspaces helping me avoid window search?
- Which apps need better assignment rules?
- Which windows should always float?

Keep AeroSpace if the answer is "this is starting to feel predictable," even if
it is not faster yet. Fluency usually comes in week two.

## Later / week two notes

- Add monitor-specific workspace rules if using an external display.
- Tune gaps after the workflow feels good; do not start with aesthetics.
- Add or remove app assignment rules based on real app ids from `aerospace list-apps`.
- Consider adding a small cheatsheet to your shell startup or notes app.
- If `option` shortcuts conflict with app text input, consider changing the
  modifier to `ctrl-option` or `cmd-option` in `aerospace.toml`.

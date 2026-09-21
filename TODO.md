# macOS setup backlog

Ideas for improving the appearance, feel, productivity, and reproducibility of
this setup. The goal is a cohesive Gruvbox Mac, not installing every interesting
utility.

## Principles

- Prefer one focused tool per job.
- Keep Spotlight unless another launcher replaces several workflows.
- Extend AeroSpace and Herdr instead of introducing competing window/session
  managers.
- Treat visual consistency, useful feedback, and readability as more important
  than animation or novelty.
- Add automation after a manual choice has proved useful.

## Next up

- [x] **Establish the dependency-free shell baseline.**

  Configure persistent, deduplicated Zsh history, native completions, and
  `fzf --zsh` history/file/directory search. Completed 2026-09-21.

- [x] **Add lightweight interactive shell feedback.**

  Add `zsh-autosuggestions` and `zsh-syntax-highlighting`, sourced directly
  without a plugin manager and with syntax highlighting loaded last. Completed
  2026-09-21.

- [ ] **Evaluate optional CLI improvements individually.**

  Candidates are `bat`, `git-delta`, `yazi`, `btop`, and `tealdeer`. Add each
  only when it solves recurring friction. If adopted, Delta should become Git's
  pager and work inside Lazygit. `gh` is already installed and configured.

- [x] **Add focused AeroSpace movement and layout actions.**

  Follow windows moved to another workspace, move and follow an individual
  window between displays, and balance workspace sizes. Keep AeroSpace
  fullscreen and accordion as the existing distraction-free choices rather than
  adding an overlapping mode. Completed 2026-09-21.

- [ ] **Add clipboard history without replacing Spotlight.**

  Try [Maccy](https://maccy.app/) on an explicit shortcut such as
  `Cmd-Shift-V`. Before adopting it, choose retention and clearing behavior and
  verify how passwords and other sensitive clipboard entries are excluded.
  Consider Raycast only if it deliberately replaces Spotlight, clipboard
  history, snippets, calculations, and quick links together.

- [ ] **Track intentional macOS defaults.**

  Add an idempotent `_scripts/macos-defaults.sh` and a dedicated Just recipe.
  Keep behavioral defaults separate from `just macos-gruvbox`.

  Settings worth evaluating:

  - Auto-hide and simplify the Dock.
  - Prevent Mission Control from rearranging Spaces.
  - Increase key-repeat speed and reduce its initial delay.
  - Show Finder's path bar, status bar, and file extensions.
  - Use expanded save/print dialogs and a dedicated screenshot directory.
  - Disable smart quotes and dashes for coding.
  - Set a Gruvbox-compatible highlight color in addition to the orange accent.
  - Give the macOS pointer a restrained Gruvbox outline or fill color.
  - Disable “click wallpaper to reveal desktop” if it fights AeroSpace.

  Verify all Space and display settings against AeroSpace before applying them.

- [ ] **Build a wallpaper collection for both displays.**

  Track several quiet Gruvbox wallpapers with negative space, including proper
  landscape and portrait compositions. Add `just wallpaper-next` to cycle only
  through that collection. Coordinate the lock screen where macOS permits it.

## Cohesive visual projects

- [ ] **Define the Gruvbox source of truth.**

  Decide between classic Gruvbox Dark Hard and Gruvbox Material Dark Hard, then
  document the canonical background, foreground, selection, accent, border,
  success, warning, and error colors. Align Ghostty, Neovim, Zed, Starship,
  `fzf`, Lazygit, Pi, Herdr, Obsidian, Brave, focused-window borders, and the
  native AeroSpace workspace indicator.

  Start with one palette file or document. A generator is justified only when a
  second theme or daytime profile creates real duplication.

- [ ] **Grow `just macos-gruvbox` into a focused theme command.**

  Eventually, `just theme gruvbox-dark` could coordinate macOS appearance,
  wallpaper, Ghostty, borders, the native workspace indicator, editors, TUIs,
  and an Obsidian CSS snippet. Browser settings can remain documented if they
  cannot be applied safely. Do not reintroduce a custom status bar without a
  concrete need that the native menu bar cannot meet.

  A restrained Gruvbox Light/day profile is more useful than collecting many
  unrelated themes. Font switching should likewise wait until there is a real
  second font profile.

- [ ] **Polish Ghostty as a visual anchor.**

  Test balanced padding around `10–14` pixels and opacity around `0.94–0.96`;
  Neovim transparency currently compounds Ghostty's `0.9` opacity. Tune cell
  height and font weight on both displays, choose an intentional title-bar
  style, and set explicit cursor and selection colors.

  Keep the cursor-warp shader, with an easy no-shader profile for screen sharing,
  battery use, and troubleshooting. A subtle Pink Floyd prism on LazyVim's
  dashboard would add personality without more editor chrome.

- [ ] **Theme the application surfaces that remain visually prominent.**

  Add a tracked Obsidian CSS snippet for headings, links, tags, callouts, code,
  graph nodes, and active navigation. Decide whether Zed's UI should use a native
  proportional font while buffers remain JetBrains Mono. Keep Brave's Gruvbox
  theme and consider a minimal matching new-tab page.

  Vimium C would improve browser keyboard navigation. Thunderbird
  `userChrome.css` is probably not worth its update maintenance unless the
  mismatch remains distracting.

- [ ] **Improve the external-display experience.**

  Choose one of [BetterDisplay](https://github.com/waydabber/BetterDisplay),
  [Lunar](https://lunar.fyi/), or MonitorControl for BenQ brightness, contrast,
  and HiDPI control. Calibrate or choose ICC profiles so Gruvbox colors and font
  weight agree across displays. Decide intentionally how True Tone, Night Shift,
  and automatic brightness should behave when docked. Test workspace placement,
  focus, portrait orientation, scaling, and window recovery after wake and after
  disconnecting or reconnecting each display.

## Workflow projects

- [ ] **Add deliberate work and personal modes.**

  A user-run `just workday` could enable Work Focus, open the required apps, let
  AeroSpace route them, and report or connect VPN state. A personal/end-of-day
  counterpart is useful only if it performs meaningful cleanup. Avoid surprising
  launch-at-login automation.

- [ ] **Improve keyboard discoverability.**

  Add `just keys` or one cheatsheet covering AeroSpace, Herdr, Neovim, Ghostty,
  and Pi. [KeyClu](https://sergii.tatarenkov.name/keyclu/support/) could expose
  application shortcuts visually. [Homerow](https://www.homerow.app/) is worth
  testing if keyboard-driven clicking would be used daily.

  A modest Karabiner mapping—tap Caps Lock for Escape, hold it for Control—fits
  the Vim workflow. Build a Hyper-key layer only after identifying concrete
  actions that do not conflict with AeroSpace's Option bindings.

- [x] **Add a repository health command.**

  Add a non-mutating `just doctor` for repository validation, Brew packages,
  expected binaries, Stow links, Pi dependencies, the Gondolin image, Herdr,
  AeroSpace, GitHub authentication, and Git identity selection. Provide
  `--only-check` for portable checks and `--verbose` for captured integration
  diagnostics. Completed 2026-09-21.

## Reliability, privacy, and recovery

- [ ] **Document backup and restore boundaries.**

  List important state that Git cannot restore, including Obsidian data, ignored
  local configuration, credentials, and application state. Choose an encrypted
  backup approach, distinguish irreplaceable data from downloadable caches such
  as `_models`, and test restoring a small representative sample.

- [ ] **Make configuration changes recoverable.**

  Add preview and recovery guidance for Stow deployment and macOS defaults.
  Capture an existing default before changing it, and distinguish restoring its
  previous value from deleting a repository-added override.

- [x] **Add lightweight, non-mutating configuration checks.**

  Add `just doctor --only-check` for shell syntax, strict JSON, TOML, Git and
  Just configuration, whitespace, conflict markers, and isolated regression
  tests for personal, work, unknown-path, and linked-worktree Git identity
  selection. Completed 2026-09-21.

- [ ] **Define a screen-sharing and presentation profile.**

  Extend Ghostty's proposed no-shader option with opaque backgrounds, readable
  font sizing, notification suppression, and a reminder to hide clipboard
  history and sensitive tabs. Start as a manual checklist and automate it only
  if it sees regular use.

- [ ] **Profile and optimize shell startup after shell features settle.**

  Keep the current configuration simple while planned shell features are still
  being added, then profile the complete startup path and optimize measured
  bottlenecks methodically. The 2026-09-21 baseline is about `0.088` seconds for
  `zsh -lic exit`; `zsh -f -ic exit` rounds to `0.000` seconds and
  `gh auth token` averages about `0.024` seconds. Inspect `compinit`, Starship,
  `fzf --zsh`, `gh auth token`, and `brew shellenv`, and introduce caching or
  lazy loading only where the measurements justify the maintenance cost.

- [x] **Document shell-history privacy.**

  Add leading-space exclusion, secret-safe command guidance, a `histedit` cleanup
  helper, and a two-shell verification procedure. Completed 2026-09-21.

## Visual utilities to evaluate

Before adopting one, record the recurring friction it solves, what current tool
it replaces, the permissions or background services it requires, and the
one-week removal criterion. A candidate should graduate into a focused task
before it is added to `Brewfile`.

These are candidates, not tasks. Install one only when its specific behavior is
wanted.

| Area | Candidate | Why or caveat |
|---|---|---|
| Inactive-window focus | [HazeOver](https://hazeover.com/) | Attractive focus effect, but avoid combining strong dimming with low terminal opacity. |
| Screensaver | [Aerial](https://aerialscreensaver.github.io/) | High-quality native-feeling screensavers; a small Gruvbox/Pink Floyd collection would be more personal. |
| Screenshots | [Shottr](https://shottr.cc/) or CleanShot X | Annotation, scrolling capture, pinning, OCR, and color picking. Keep native shortcuts where sufficient. |
| Media/brightness HUD | [MediaMate](https://wouter01.github.io/MediaMate/) | Polished notch-aware feedback, but paid and mostly cosmetic. |
| Now playing | Sleeve or Tuneful | Use only if media information is not already present in the menu bar or notch. |
| Presentation keys | KeyCastr | Useful for demos and recordings, not as a permanent background utility. |
| Desktop information | Tinted macOS widgets | Calendar, weather, and battery can work if kept sparse and monochrome. |
| App launching | Raycast | Valuable only as an intentional consolidation, not as a second Spotlight. |

Other low-cost visual touches include a coordinated user avatar, clean folder
icons, hidden desktop icons, and a restrained Dock size. Avoid replacing all app
icons: application updates make that a recurring maintenance job.

## Deliberate non-goals

- Another tiling manager alongside AeroSpace.
- tmux alongside Herdr.
- Oh My Zsh or a large shell framework.
- Nix/Home Manager before Brew and Stow create an actual reproducibility problem.
- Multiple launchers, menu bars, clipboard managers, or screenshot tools.
- Heavy terminal shaders, animated wallpapers, desktop system-monitor overlays,
  or permanent shell startup animations.
- A generated multi-theme framework before a second theme is genuinely wanted.

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

- [ ] **Build a better shell baseline.**

  Configure persistent, deduplicated Zsh history; completions; and `fzf --zsh`
  history/file/directory search. Add `zoxide`, `zsh-autosuggestions`, and
  `zsh-syntax-highlighting` loaded last. Add `direnv`, since `.direnv` is already
  in the global Git ignore, and `gh` for GitHub workflows.

  A small optional CLI set would be `bat`, `git-delta`, `yazi`, `btop`, and
  `tealdeer`. Delta should become Git's pager and work inside Lazygit. Avoid a
  large Zsh framework.

- [ ] **Give AeroSpace a clear focused-window treatment.**

  Add [JankyBorders](https://github.com/FelixKratz/JankyBorders) with a thin
  Gruvbox yellow or aqua active border and a subtle inactive border. Test gaps
  of `10` or `12`, including different densities for the MacBook and portrait
  BenQ.

  Add focused actions for moving a window and following it, moving it to the
  other display, balancing a workspace, and toggling a distraction-free
  single-window layout. Native macOS fullscreen should remain the exception.

- [ ] **Add clipboard history without replacing Spotlight.**

  Try [Maccy](https://maccy.app/) on an explicit shortcut such as
  `Cmd-Shift-V`. Consider Raycast only if it deliberately replaces Spotlight,
  clipboard history, snippets, calculations, and quick links together.

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

  The existing `pink-floyd-gruvbox-dark.jpg` contains PNG data; rename it to
  `.png` or convert it to a real JPEG.

- [ ] **Choose one menu-bar direction.**

  The low-maintenance option is [Ice](https://github.com/jordanbaird/Ice), with
  Itsycal and native controls left visible. The full visual option is a minimal
  [SketchyBar](https://github.com/FelixKratz/SketchyBar) showing AeroSpace
  workspaces, focused app, date/time, battery, VPN, Focus, microphone, and
  screen-recording state.

  A custom bar should distinguish focused, occupied, and urgent workspaces,
  support the notch and portrait display, and hide secondary metrics behind
  clicks or popovers. Do not maintain both approaches.

## Cohesive visual projects

- [ ] **Define the Gruvbox source of truth.**

  Decide between classic Gruvbox Dark Hard and Gruvbox Material Dark Hard, then
  document the canonical background, foreground, selection, accent, border,
  success, warning, and error colors. Align Ghostty, Neovim, Zed, Starship,
  `fzf`, Lazygit, Pi, Herdr, Obsidian, Brave, and any window borders/bar.

  Start with one palette file or document. A generator is justified only when a
  second theme or daytime profile creates real duplication.

- [ ] **Grow `just macos-gruvbox` into a focused theme command.**

  Eventually, `just theme gruvbox-dark` could coordinate macOS appearance,
  wallpaper, Ghostty, borders, the optional bar, editors, TUIs, and an Obsidian
  CSS snippet. Browser settings can remain documented if they cannot be applied
  safely.

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
  and automatic brightness should behave when docked.

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

- [ ] **Add a repository health command.**

  `just doctor` should check Brew packages, expected binaries, Stow links, Pi
  dependencies, the Gondolin image, Herdr integration, AeroSpace configuration,
  and Git identity selection. Add an explicit update command if
  `HOMEBREW_NO_AUTO_UPDATE=1` remains enabled.

- [ ] **Clean up existing inconsistencies.**

  Remove duplicate Homebrew initialization from `.zprofile` and `.zshrc`.
  Replace `alias pass='cat ~/.pass | pbcopy'` with Bitwarden CLI or macOS
  Keychain retrieval. Correct the Herdr documentation that says two tabs when
  the plugin creates `shell`, `pi`, and `nvim`.

## Visual utilities to evaluate

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

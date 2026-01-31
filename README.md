# hrmnjt dev environment

> Personal dotfiles repository tailored to my specific workflow. May not be directly applicable to others.

## Usage

Read Justfile

## ClickOps configuration

- Settings: iCloud sign in
- Settings: General > Software Update
- Settings: Desktop & Dock
    - Reduce dock icon size
    - Position on screen: Left
    - Minimize windows to application icon: On
    - Automatically hide and show dock: On
    - Animate opening windows: Off
    - Show suggested and recent apps in Dock: Off
    - Default web browser: Firefox Developer Edition
- Firefox
    - Install extensions: uBlock Origin, Privacy Badger, Decentraleyes, 
    Readwise Highlighter, Bitwarden
    - Sign in to web.whatsapp.com, and Bitwarden
    - Connect Readwise account
    - Rearrange extensions from Customize Toolbar section
    - From new tab, remove background and shortcuts
- Alt-tab: open at login
- Alt-tab: change shortcuts to use <kbd>cmd</kbd> instead of <kbd>opt</kbd>


## TODOs

Things I might do

- [ ] README restructure (Ampcode suggestions)
    - Move Justfile overview to top with architectural context
    - Create Quick Start section with core commands (`just stowall`, `just brewinst`, `just brewcheck`)
    - Add Prerequisites section (Home   brew, GNU stow, XDG_CONFIG_HOME)
    - Reorganize flow: Overview → Prerequisites → Quick Start → ClickOps → TODOs
    - Add Philosophy/Approach note (stow-based, XDG compliance, config separation)
- [ ] Neovim config organization - init.lua is 35KB monolith, `lua/custom/plugins/init.lua` is empty/unused
- [ ] Terminal consolidation - maintaining both Ghostty and WezTerm configs; pick one?
- [ ] WezTerm cleanup - has commented-out workspace switching code
- [ ] Missing tool configs - direnv, fzf, zoxide, ripgrep installed but no custom configs

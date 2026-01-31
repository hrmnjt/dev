# hrmnjt dev environment

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

- [ ] Appendix: figure out approach for creating SSH keys for Github
- [ ] Ampcode's suggestions
    - Move Justfile overview to top - Replace the TODO at line 5 with a condensed version of the Justfile's project overview. Add that architectural context early so future you understands what this repo does at a glance.
    - Add explicit "Personal Project" statement - Add a brief note like "This is a personal dotfiles repository tailored to my specific workflow. It may not be directly applicable to others" to set expectations upfront.
    - Create a Quick Start section - List the core commands from Justfile (just stowall, just brewinst, just brewcheck) with brief descriptions. This bridges the TODO gap you already noted.
    - Link important dependencies - Add a section highlighting critical prerequisites (Homebrew, GNU stow, XDG_CONFIG_HOME setup) before the appendices so you don't skip them on future machines.
    - Reorganize the structure - The current flow is: Usage (TODO) → ClickOps → TODOs → Appendices. Reorder to: Overview → Prerequisites → Quick Start → ClickOps → TODOs → Appendices. This creates better narrative flow.
    - Add Philosophy/Approach note - Document why you chose stow-based approach (vs symlink manually), why configs are split across multiple directories, and the XDG standard approach. This helps future you remember design decisions.
    - Expand the TODOs section - Some items are unclear (e.g., "Update usage for my reference"). Be more specific about what needs documenting so future you knows exactly what's incomplete.
    - Note sensitive data handling - The Justfile mentions secrets go to Bitwarden, but README doesn't. Add a brief note about where credentials/keys should go since it's easy to forget.

---

## Appendix: SSH Key for Github

Create new SSH key for Github and store passphrase on Bitwarden

```
ssh-keygen -t ed25519 -a 100 -f ~/.ssh/id_ed25519_github_YYYYMMDD -C "USERNAME@HOSTNAME"
```

Add SSH key to ssh-agent

```
# start ssh-agent in background
eval "$(ssh-agent -s)"

# create or edit SSH config with
vim ~/.ssh/config

# and add below to config
Host github.com
  AddKeysToAgent yes
  IdentityFile ~/.ssh/id_ed25519_github_YYYYMMDD

# add keys to Apple Keychain
ssh-add --apple-use-keychain ~/.ssh/id_ed25519_YYYYMMDD
```

Add SSH key to Github - https://github.com/settings/keys after copying the
public key from local

```
pbcopy < ~/.ssh/id_ed25519_github_YYYYMMDD.pub
```

Test out the keys by doing

```
ssh git@github.com
```



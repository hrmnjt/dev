# hrmnjt dev environment

## Setting up `.config` directory

Ensuring `${XDG_CONFIG_HOME}` is set
```sh
echo ${XDG_CONFIG_HOME}
# not set yet
```

Setting `${XDG_CONFIG_HOME}`
```sh
# Checking if ~/.config exists and create if not
mkdir -p ~/.config

# Creating ~/.zshenv as it doesn't exist by default
touch ~/.zshenv

# added below line to zshenv
export XDG_CONFIG_HOME="$HOME/.config"

# save and restart shell
```

## SSH Key for Github

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

- [ ] Elegant approach to use `.gitconfig` with folder structure as per [git
organized](https://hrmnjt.dev/2024/02/18/gitmoreorg/)


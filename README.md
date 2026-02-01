# sudo make me a sandwich!

## What is in the repo?
- Ingredients...
- ...prepared the way I like it...
- ...so that, I handcraft my sandwich...
- ...quickly, even in a new kitchen

It also reminds me how I like my sandwich, coz sometimes I forget.

BTW, Borrowed reference from [XKCD 149](https://xkcd.com/149/), BTW.

## What is this not?
- stuff that might not suit your workflow!
- might not work for anything other than macosx as of now.

## for future Harman

When you get a new macosx:

```bash
# Step 1: [Install Homebrew](https://brew.sh/)

# Step 2: Install just and stow: 
brew install just stow

# Step 3: Clone this repo:
mkdir -p ~/code/github.com/hrmnjt
git clone https://github.com/hrmnjt/dev.git ~/code/github.com/hrmnjt/dev
cd dev

# Step 4: Setup XDG and zsh config
just xdgsetup

# Step 5: Restart terminal to load zsh config, then install all packages
just brewinst

# Step 6: .dotfiles in place with stow
`just stowall`

# Step 7: Generate SSH key for GitHub
`just ghsshkey`

# Step 8: Create git directory structure
`just gitsetup`
```

"Business as Usual" workflow

```bash
# Check if Brewfile matches installed packages
just brewcheck

# See what's installed but not in Brewfile
just brewdiff

# Remove packages not in Brewfile
just brewclean
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

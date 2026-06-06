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
# Step 1: Set the Mac hostname (replace with your preferred name)
sudo scutil --set ComputerName "Harman's MacBook"
sudo scutil --set LocalHostName "harmans-macbook"
sudo scutil --set HostName "harmans-macbook"

# Step 2: [Install Homebrew](https://brew.sh/)

# Step 3: Install just and stow: 
brew install just stow

# Step 4: Clone this repo:
mkdir -p ~/code/github.com/hrmnjt
git clone https://github.com/hrmnjt/dev.git ~/code/github.com/hrmnjt/dev
cd dev

# Step 5: Setup XDG and zsh config
just xdgsetup

# Step 6: Restart terminal to load zsh config, then install all packages
just brewinst

# Step 7: Install pi separately (not in Brewfile)
# Use the current curl installer from: https://pi.dev/docs/latest/quickstart#install

# Step 8: .dotfiles in place with stow
`just stowall`

# Step 9: Install pi extension dependencies
`just pi-deps`

# Step 9.5: Apply gruvbox-inspired macOS appearance and wallpaper
`just macos-gruvbox`

# If ~/.pi was accidentally folded as a symlink into this repo, fix it before using pi:
# ls -ld ~/.pi ~/.pi/agent
# If either points into ~/code/github.com/hrmnjt/dev/pi/.pi, run:
# just unstowall
# rm ~/.pi
# mkdir -p ~/.pi/agent
# just stowall
# just pi-deps

# Step 10: Build the custom Gondolin VM image for pi tools
`just gondolin-image`

# Step 11: Generate SSH key for GitHub
`just ghsshkey`
# Add the copied public key to GitHub, then test SSH auth:
ssh -T git@github.com

# Step 12: Switch this repo from HTTPS to SSH once GitHub SSH is working
git remote set-url origin git@github.com:hrmnjt/dev.git

# Step 13: Create git directory structure
`just gitsetup`
```


## Gruvbox macOS appearance

This repo tracks the Pink Floyd gruvbox wallpaper at:

```text
wallpapers/.local/share/wallpapers/pink-floyd-gruvbox-dark.jpg
```

After `just stowall`, apply the wallpaper and dark macOS appearance on the host Mac:

```bash
just macos-gruvbox
```

That recipe:

- sets macOS dark mode
- sets the macOS accent color to orange
- applies the tracked wallpaper to every desktop/space

The wallpaper is deployed through stow to:

```text
~/.local/share/wallpapers/pink-floyd-gruvbox-dark.jpg
```

If macOS does not immediately refresh accent/highlight colors, log out and back in.

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
    - Position on screen: Right
    - Minimize windows to application icon: On
    - Automatically hide and show dock: On
    - Animate opening windows: Off
    - Show suggested and recent apps in Dock: Off
    - Default web browser: Brave Browser
- Brave
  - Install extensions: Bitwarden, Readwise Highlighter, Dark Reader
  - Install themes: Gruvbox Slate
  - Go through settings and change the details where applicable
- AeroSpace: grant Accessibility permission on first launch; see `aerospace/README.md`

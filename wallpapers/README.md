# Wallpapers

This package tracks one wallpaper per theme:

```text
wallpapers/.local/share/wallpapers/pink-floyd-gruvbox-dark.jpg
wallpapers/.local/share/wallpapers/nord-aurora-dark.jpg
```

`just stowall` deploys them to `~/.local/share/wallpapers/`. The Nord image is
a generated aurora over Polar Night ridges in Nord colors; replace it with any
3840×2160 image under the same name.

`just theme` sets the selected theme's wallpaper on every desktop, together
with dark mode and the accent colour; re-run it to reapply:

```bash
just theme gruvbox  # or: just theme nord
```

See [Nord](../NORD.md) for everything else the switch changes.

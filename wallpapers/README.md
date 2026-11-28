# Wallpapers

This package tracks one wallpaper per theme:

```text
wallpapers/.local/share/wallpapers/pink-floyd-gruvbox-dark.jpg
wallpapers/.local/share/wallpapers/dota-2-nord-dark.jpg
```

`just stowall` deploys them to `~/.local/share/wallpapers/`. The Nord image is
a sepia Dota 2 hero collage at 3840×2160, from
[Alpha Coders](https://images4.alphacoders.com/101/1019606.jpg). To change
either, replace the file and update its path in `_scripts/theme.sh` and
`_scripts/tests/theme.sh`.

`just theme` sets the selected theme's wallpaper on every desktop, together
with dark mode and the accent colour; re-run it to reapply:

```bash
just theme gruvbox  # or: just theme nord
```

See [Nord](../NORD.md) for everything else the switch changes.

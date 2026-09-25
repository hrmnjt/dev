# Ghostty configuration

This package configures Ghostty as the primary terminal.

```text
ghostty/.config/ghostty/config -> ~/.config/ghostty/config
```

The configuration uses JetBrains Mono Nerd Font, the classic Gruvbox Dark Hard
theme, 12-pixel padding, a `0.95`-opacity blurred background, an 18-point font,
and a cursor movement shader. Yellow cursor and dark selection colors are set
explicitly from [the palette](../GRUVBOX.md). Window maximization is left to
AeroSpace rather than forced by Ghostty.

## Cursor animation

`shaders/cursor_warp.glsl` provides a short, fading Neovide-style animation for
cursor movements. It uses Ghostty's current cursor color and ignores movements
shorter than 1.5 cursor heights to avoid adding a trail to nearby positions.
Ghostty's default focused-window animation loop is sufficient; no
`custom-shader-animation` override is needed.

The shader is adapted from
[`sahaj-b/ghostty-cursor-shaders`](https://github.com/sahaj-b/ghostty-cursor-shaders/blob/06d4e90fb5410e9c4d0b3131584060adddf89406/cursor_warp.glsl)
and is used under the MIT license included at the top of the shader.

To disable the animation, comment out the `custom-shader` setting in
`.config/ghostty/config`. This is also the recovery step if a shader error
prevents a terminal window from rendering correctly.

Install and deploy from the repository root:

```bash
brew bundle install
just stowall
```

Reload Ghostty with `Cmd-Shift-,` after changing the configuration. Some
settings may require a new terminal to take effect. Compare padding, selection
contrast, and text legibility on both displays, including Neovim's transparent
background. If the result feels worse, revert the visual settings in
`.config/ghostty/config`; disabling the shader is still just one commented
line. Shell integration for fresh login shells is handled in `zsh/.zshrc`.

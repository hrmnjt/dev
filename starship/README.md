# Starship configuration

This package provides a Pure-inspired, two-line Starship prompt using the
repository's Gruvbox palette. A `nord` palette uses the same color names; with
`just theme nord`, Zsh points `STARSHIP_CONFIG` at a copy of this file that
selects it. See [Nord](../NORD.md).

```text
starship/.config/starship.toml -> ~/.config/starship.toml
```

The prompt shows the current directory, Git state, Python, virtual environment,
Docker context, command duration, and the previous command's exit status. Nerd
Font glyphs require the JetBrains Mono Nerd Font tracked in `Brewfile`.

Install, deploy, and reload from the repository root:

```bash
brew bundle install
just stowall
loadshell
```

Starship is initialized by `zsh/.zshrc`.

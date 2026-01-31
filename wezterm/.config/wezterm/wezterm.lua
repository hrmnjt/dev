local wezterm = require("wezterm")

local config = wezterm.config_builder()

-- setting default font
config.font = wezterm.font("JetBrains Mono")
config.font_size = 16

-- changing color scheme for editor window
config.color_scheme = "catppuccin-mocha"

-- changing initial geometry of windows (almost full screen)
config.initial_cols = 256
config.initial_rows = 128

return config

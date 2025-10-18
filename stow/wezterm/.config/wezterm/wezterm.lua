local wezterm = require("wezterm")

local config = wezterm.config_builder()

-- setting default font
config.font = wezterm.font("JetBrains Mono")
config.font_size = 18

-- changing color scheme for editor window
config.color_scheme = "Rosé Pine (base16)"

-- changing initial geometry of windows (almost full screen)
config.initial_cols = 128
config.initial_rows = 30

config.use_fancy_tab_bar = false
config.hide_tab_bar_if_only_one_tab = true

return config

local wezterm = require 'wezterm'

local config = wezterm.config_builder()

-- setting default font
config.font = wezterm.font("JetBrains Mono")
config.font_size = 18

-- changing color scheme for editor window
config.color_scheme = 'Tokyo Night'

-- changing initial geometry of windows (almost full screen)
config.initial_cols = 128
config.initial_rows = 30

config.use_fancy_tab_bar = false
config.hide_tab_bar_if_only_one_tab = true

config.colors = {
    tab_bar = {
        background = "#11111b",

        active_tab = {
            bg_color = "#585b70",
            fg_color = "#cdd6f4",
            intensity = 'Normal',
            underline = 'None',
            italic = false,
            strikethrough = false,
        },

        inactive_tab = {
            bg_color = "#313244",
            fg_color = "#a6adc8",
        },

        inactive_tab_hover = {
            bg_color = "#313244",
            fg_color = "#a6adc8",
            italic = true,
        },

        new_tab = {
            bg_color = "#1e1e2e",
            fg_color = "#cdd6f4",
        },

        new_tab_hover = {
            bg_color = "#1e1e2e",
            fg_color = "#cdd6f4",
            italic = true,
        },
    },
}

return config

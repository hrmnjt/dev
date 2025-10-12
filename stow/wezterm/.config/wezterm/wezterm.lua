local wezterm = require 'wezterm'

local config = wezterm.config_builder()

-- Catppuccin Mocha color palette
-- used for tab bar formatting
local catppuccin_mocha = {
    text = "#cdd6f4",
    subtext1 = "#bac2de",
    subtext0 = "#a6adc8",
    surface2 = "#585b70",
    surface1 = "#45475a",
    surface0 = "#313244",
    base = "#1e1e2e",
    mantle = "#181825",
    crust = "#11111b",
}

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
        background = catppuccin_mocha.crust,

        active_tab = {
            bg_color = catppuccin_mocha.surface2,
            fg_color = catppuccin_mocha.text,
            intensity = 'Normal',
            underline = 'None',
            italic = false,
            strikethrough = false,
        },

        inactive_tab = {
            bg_color = catppuccin_mocha.surface0,
            fg_color = catppuccin_mocha.subtext0,
        },

        inactive_tab_hover = {
            bg_color = catppuccin_mocha.surface1,
            fg_color = catppuccin_mocha.text,
            italic = true,
        },

        new_tab = {
            bg_color = catppuccin_mocha.base,
            fg_color = catppuccin_mocha.text,
        },

        new_tab_hover = {
            bg_color = catppuccin_mocha.mantle,
            fg_color = catppuccin_mocha.text,
            italic = true,
        },
    },
}

return config

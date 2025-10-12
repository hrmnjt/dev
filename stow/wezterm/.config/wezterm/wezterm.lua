local wezterm = require 'wezterm'

local config = wezterm.config_builder()

config.font = wezterm.font("JetBrains Mono")
config.font_size = 16
config.color_scheme = 'catppuccin-mocha'

config.keys = {
  {
    key = 'r',
    mods = 'CMD|SHIFT',
    action = wezterm.action.ReloadConfiguration,
  },
}

config.window_frame = {
  font = wezterm.font { family = 'JetBrains Mono', weight = 'Bold' },

  font_size = 12.0,

  active_titlebar_bg = '#333333',

  inactive_titlebar_bg = '#333333',
}

config.colors = {
  tab_bar = {
    inactive_tab_edge = '#575757',
  },
}

return config

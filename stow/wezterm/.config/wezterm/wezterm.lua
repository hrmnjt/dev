local wezterm = require 'wezterm'

local config = wezterm.config_builder()

config.font_size = 16
config.color_scheme = 'Batman'

config.keys = {
  {
    key = 'r',
    mods = 'CMD|SHIFT',
    action = wezterm.action.ReloadConfiguration,
  },
}

return config

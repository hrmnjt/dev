local wezterm = require("wezterm")

local config = wezterm.config_builder()

-- setting default font
config.font = wezterm.font("JetBrains Mono")
config.font_size = 16

-- changing color scheme for editor window
config.color_scheme = "Rosé Pine (base16)"

-- changing initial geometry of windows (almost full screen)
config.initial_cols = 256
config.initial_rows = 128

config.use_fancy_tab_bar = false
config.hide_tab_bar_if_only_one_tab = false
config.window_decorations = "INTEGRATED_BUTTONS|RESIZE"

local bar = wezterm.plugin.require("https://github.com/adriankarlen/bar.wezterm")
bar.apply_to_config(config, {
	position = "top",
	padding = {
		left = 0,
		right = 0,
	},
	separator = {
		space = 1,
		left_icon = ":",
		right_icon = "",
		field_icon = "",
	},
	modules = {
		pane = {
			enabled = false,
		},
		username = {
			enabled = false,
		},
		hostname = {
			enabled = false,
		},
		cwd = {
			enabled = false,
		},
		spotify = {
			enabled = false,
		},
	},
})

return config

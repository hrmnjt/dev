local wezterm = require("wezterm")

local config = wezterm.config_builder()

config.leader = { key = "a", mods = "CTRL", timeout_milliseconds = 1000 }

-- setting default font
config.font = wezterm.font("JetBrains Mono")
config.font_size = 16

-- changing color scheme for editor window
config.color_scheme = "catppuccin-mocha"

-- changing initial geometry of windows (almost full screen)
config.initial_cols = 256
config.initial_rows = 128

config.use_fancy_tab_bar = false
config.hide_tab_bar_if_only_one_tab = false
config.window_decorations = "INTEGRATED_BUTTONS|RESIZE"

local bar = wezterm.plugin.require("https://github.com/adriankarlen/bar.wezterm")
bar.apply_to_config(config, {
	position = "top",
	padding = { left = 0, right = 0 },
	separator = { space = 1, left_icon = ":", right_icon = "", field_icon = "" },
	modules = {
		pane = { enabled = false },
		username = { enabled = false },
		hostname = { enabled = false },
		cwd = { enabled = false },
		spotify = { enabled = false },
	},
})

local workspace_switcher = wezterm.plugin.require("https://github.com/MLFlexer/smart_workspace_switcher.wezterm")

workspace_switcher.apply_to_config(config)
config.default_workspace = "~/code"

return config

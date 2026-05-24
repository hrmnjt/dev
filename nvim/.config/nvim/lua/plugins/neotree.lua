-- neo-tree: show dotfiles + never hide folders by name
return {
	{
		"nvim-neo-tree/neo-tree.nvim",
		opts = {
			filesystem = {
				filtered_items = {
					visible = true, -- show filtered items (dimmed)
					hide_dotfiles = false, -- show .dotfiles
					hide_gitignored = false, -- show gitignored files too
					hide_by_name = {}, -- don't hide any files by name
					hide_empty_folders = false,
				},
			},
		},
	},
}


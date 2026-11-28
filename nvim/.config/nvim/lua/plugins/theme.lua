-- Gruvbox is the default; `just theme nord` switches. Read the selection at
-- start so every new Neovim matches it; see NORD.md.
local selected_theme = require("config.theme").selected

return {
  -- lazy.nvim loads a colorscheme plugin when `colorscheme` names it.
  {
    "ellisonleao/gruvbox.nvim",
    lazy = true,
    priority = 1000,
    opts = {
      contrast = "hard",
      transparent_mode = true,
    },
  },
  {
    "gbprod/nord.nvim",
    lazy = true,
    priority = 1000,
    opts = {
      transparent = true,
    },
  },
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = selected_theme(),
    },
  },
}

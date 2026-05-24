-- Gruvbox theme (overrides LazyVim default)
-- Disable unused colorschemes that LazyVim includes by default
return {
  {
    "ellisonleao/gruvbox.nvim",
    priority = 1000,
    opts = {},
  },
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "gruvbox",
    },
  },
  { "catppuccin", enabled = false },
  { "tokyonight.nvim", enabled = false },
}
-- Gruvbox theme (overrides LazyVim default)
return {
  {
    "ellisonleao/gruvbox.nvim",
    priority = 1000,
    opts = {
      -- Let Ghostty's transparent background show through Neovim.
      transparent_mode = true,
    },
  },
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "gruvbox",
    },
  },
}
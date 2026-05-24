-- snacks explorer config: show dotfiles and gitignored content by default
-- Toggle live with: H (hidden/dotfiles), I (gitignored)
return {
  {
    "folke/snacks.nvim",
    opts = {
      explorer = {
        replace_netrw = true, -- open nvim . in explorer
      },
      picker = {
        sources = {
          explorer = {
            hidden = true, -- show dotfiles on launch
            ignored = true, -- show gitignored files on launch
          },
        },
      },
    },
  },
}
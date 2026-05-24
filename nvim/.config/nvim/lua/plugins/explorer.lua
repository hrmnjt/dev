-- snacks explorer config
-- Opens as sidebar when running nvim on a directory (e.g. nvim .)
-- Does NOT open when editing a file directly (e.g. nvim file.lua)
-- Toggle: <leader>e (open/focus), :q or <C-w>q (close from explorer pane)
-- In-explorer: H (toggle dotfiles), I (toggle gitignored)
return {
  {
    "folke/snacks.nvim",
    opts = {
      explorer = {
        replace_netrw = true, -- only open explorer for directories (nvim .)
      },
      picker = {
        sources = {
          explorer = {
            hidden = true, -- show dotfiles on launch
            ignored = true, -- show gitignored files on launch
            layout = {
              preset = "sidebar",
              layout = {
                width = 30, -- narrower sidebar (default is 40)
              },
            },
          },
        },
      },
    },
  },
}
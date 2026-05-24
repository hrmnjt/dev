-- snacks config: explorer + dashboard
-- Explorer: opens as sidebar on nvim . only, not on nvim file.lua
--   Toggle: <leader>e (open/focus), :q or <C-w>q (close)
--   In-explorer: H (toggle dotfiles), I (toggle gitignored)
return {
  {
    "folke/snacks.nvim",
    opts = {
      explorer = {
        replace_netrw = true,
      },
      picker = {
        sources = {
          explorer = {
            hidden = true,
            ignored = true,
            layout = {
              preset = "sidebar",
              layout = {
                width = 25,
              },
            },
          },
        },
      },
      dashboard = {
        preset = {
          header = [[
  .---------.
  |.-------.|
  ||>run#  ||
  ||       ||
  |"-------'|
.-^---------^-.
| ---~  hrmnjt|
"-------------'
          ]],
        },
      },
    },
  },
}
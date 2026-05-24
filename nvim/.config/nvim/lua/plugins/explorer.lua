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
 --------
< neovim >
 --------
        \   ^__^
         \  (oo)\_______
            (__)\       )\/\
                ||----w |
                ||     ||
          ]],
          -- Slimmed-down key shortcuts (default has 8, we keep 4)
          keys = {
            { icon = " ", key = "f", desc = "Find File", action = ":lua Snacks.dashboard.pick('files')" },
            { icon = " ", key = "n", desc = "New File", action = ":ene | startinsert" },
            { icon = " ", key = "g", desc = "Find Text", action = ":lua Snacks.dashboard.pick('live_grep')" },
            { icon = " ", key = "q", desc = "Quit", action = ":qa" },
          },
        },
        sections = {
          { section = "header" },
          { section = "keys", gap = 1, padding = 1 },
          { icon = "󰉋 ", title = "Recent Projects", section = "projects", indent = 2, padding = 1 },
          { icon = " ", title = "Recent Files", section = "recent_files", indent = 2, limit = 5 },
        },
      },
    },
  },
}
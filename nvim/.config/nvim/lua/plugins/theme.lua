-- Gruvbox is the default; `just theme nord` switches. Read the selection at
-- start so every new Neovim matches it; see NORD.md.
local function selected_theme()
  local state = vim.env.XDG_STATE_HOME
  if not state or state == "" then
    state = vim.env.HOME .. "/.local/state"
  end
  local file = io.open(state .. "/hrmnjt-dev/theme", "r")
  if not file then
    return "gruvbox"
  end
  local theme = file:read("*l")
  file:close()
  return theme == "nord" and "nord" or "gruvbox"
end

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

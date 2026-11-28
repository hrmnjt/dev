-- `just theme` records gruvbox (the default) or nord in one line; see NORD.md.
-- plugins/theme.lua picks the colorscheme with it, and lazy.lua uses the same
-- one while installing plugins.
local M = {}

function M.selected()
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

return M

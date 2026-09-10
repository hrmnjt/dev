-- herdr-nvim annotations (ChmaraX/herdr-nvim).
--
-- Only the nvim half of the plugin lives here. The herdr half (sidebar and
-- file picker) is installed on the host with `herdr plugin install
-- ChmaraX/herdr-nvim` and bound in herdr's config.toml.
--
-- Default keymaps, active inside herdr sessions:
--   <leader>ac  comment current line / selection
--   <leader>al  list comments
--   <leader>as  paste comments into the agent's input
--   <leader>aS  send comments to the agent (auto-submit)
--
-- `<leader>a` is unused by LazyVim, and the plugin never overrides an
-- existing map.

return {
  {
    "ChmaraX/herdr-nvim",
    opts = {},
  },
}

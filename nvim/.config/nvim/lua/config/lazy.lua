-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  local lazyrepo = "https://github.com/folke/lazy.nvim.git"
  local out = vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
  if vim.v.shell_error ~= 0 then
    vim.api.nvim_echo({
      { "Failed to clone lazy.nvim:\n", "ErrorMsg" },
      { out, "WarningMsg" },
      { "\nPress any key to exit..." },
    }, true, {})
    vim.fn.getchar()
    os.exit(1)
  end
end
vim.opt.rtp:prepend(lazypath)

-- Load LazyVim + your plugins
require("lazy").setup({
  spec = {
    -- LazyVim base
    { "LazyVim/LazyVim", import = "lazyvim.plugins" },

    -- Language extras
    { import = "lazyvim.plugins.extras.lang.python" },

    -- Your custom plugins
    { import = "plugins" },
  },
  defaults = {
    lazy = false, -- most plugins load on startup
    version = false, -- use latest git commit
  },
  install = { colorscheme = { "gruvbox" } },
  checker = {
    enabled = true, -- check for plugin updates periodically
    notify = false, -- don't notify on every update check
  },
  performance = {
    rtp = {
      -- disable unnecessary built-in plugins
      disabled_plugins = {
        "gzip",
        "tarPlugin",
        "tohtml",
        "tutor",
        "zipPlugin",
      },
    },
  },
})

-- LazyVim loads custom autocommands on the VeryLazy event.

-- LazyVim enables spell checking for prose-oriented file types. Keep it off in
-- every buffer, including the buffer that was open while this file loaded.
vim.opt.spell = false

vim.api.nvim_create_autocmd("FileType", {
  pattern = "*",
  callback = function()
    vim.opt_local.spell = false
  end,
  desc = "Disable spell checking",
})

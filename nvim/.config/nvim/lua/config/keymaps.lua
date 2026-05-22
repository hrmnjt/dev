-- Keymaps are auto-configured by LazyVim
-- Add your own here

local map = vim.keymap.set

-- Easier split navigation
map("n", "<C-h>", "<C-w><C-h>", { desc = "Focus left" })
map("n", "<C-l>", "<C-w><C-l>", { desc = "Focus right" })
map("n", "<C-j>", "<C-w><C-j>", { desc = "Focus down" })
map("n", "<C-k>", "<C-w><C-k>", { desc = "Focus up" })

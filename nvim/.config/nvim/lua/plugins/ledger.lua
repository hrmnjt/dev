return {
  {
    "ledger/vim-ledger",
    init = function()
      vim.g.ledger_bin = "hledger"
      vim.g.ledger_is_hledger = true

      -- Keep Vim's external formatter disabled: `hledger print` is not a
      -- lossless formatter for directives, includes, and other journal text.
      vim.g.ledger_dangerous_formatprg = false
    end,
  },
}

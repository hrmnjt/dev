-- SQL + Markdown language support
-- (Python is handled by lazyvim.plugins.extras.lang.python)
return {
  -- SQL LSP
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        sqlls = {},
        marksman = {},
      },
    },
  },

  -- SQL + Markdown linting and formatting
  {
    "stevearc/conform.nvim",
    optional = true,
    opts = {
      formatters_by_ft = {
        sql = { "sqlfluff" },
        markdown = { "markdownlint" },
      },
    },
  },
  {
    "mfussenegger/nvim-lint",
    optional = true,
    opts = {
      linters_by_ft = {
        sql = { "sqlfluff" },
        markdown = { "markdownlint" },
      },
    },
  },

  -- Mason: auto-install SQL + Markdown tools
  {
    "mason-org/mason.nvim",
    opts = {
      ensure_installed = {
        "sqlls",
        "sqlfluff",
        "marksman",
        "markdownlint",
      },
    },
  },

  -- Pretty markdown rendering
  {
    "MeanderingProgrammer/render-markdown.nvim",
    ft = "markdown",
    opts = {},
  },
}

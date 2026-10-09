# Personal instructions

- Use the repository's `CLAUDE.md` / `AGENTS.md` and package README.
- Leave Homebrew, Stow deployment, launchd, macOS defaults, VPN, and local-LLM
  service operations to me; provide the command instead.
- Use the configured Git identity. Never invent an identity, set `--author`,
  override author/committer variables, or add Claude attribution.
- On this Mac, identity selection is path-based. Do not change `user.name` or
  `user.email` to make a commit succeed in an unknown path.
- Do not push, open pull requests, or rewrite published history unless asked.
- Prefer Conventional Commits: branch `<type>/<scope>/<short-kebab-description>`,
  commit `<type>(<scope>): <short imperative summary>`.
- Python is uv-first: use `uv run`, `uv add`, and `uv venv`, not pip or poetry.

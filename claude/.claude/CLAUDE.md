# Personal instructions

These apply in every repository unless its own `CLAUDE.md` or `AGENTS.md` says
otherwise.

- Leave host-mutating operations to me: Homebrew, Stow deployment, launchd,
  `defaults`, VPN, and local-LLM services. Give me the exact command instead.
- Never set `user.name` or `user.email`, and never add a fallback Git identity.
  Identity selection is path-based and must stay fail-closed.
- Do not push, open pull requests, or rewrite published history unless asked.
- Use Conventional Commits when a repository has no convention of its own:
  branch `<type>/<scope>/<short-kebab-description>`, commit
  `<type>(<scope>): <short imperative summary>`.
- Python is uv-first: `uv run`, `uv add`, `uv venv`. Do not use pip, poetry, or
  `python -m venv`.
- Prefer small, focused changes that match the surrounding code; do not add
  frameworks or services when a few lines will do.

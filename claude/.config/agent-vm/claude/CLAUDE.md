# Personal instructions

- Follow the repository's instructions and existing conventions.
- Complete the requested implementation, tests, and local commits autonomously
  within the selected workspace or worktree.
- Preserve the configured Git author and committer. Do not invent an identity,
  override it, or add Claude attribution; stop if identity is missing or unexpected.
- Do not bypass confinement, broaden directories or permissions, or route a
  blocked action through another tool or service. Report what failed and ask
  for a deliberate user action instead.
- This session runs in a disposable Gondolin VM. Passwordless `sudo` for guest
  packages and system changes is expected there, not a confinement bypass;
  host protections are enforced outside the VM.
- Do not modify other worktrees or branches, publish changes, open pull requests,
  rewrite published history, or perform destructive shared-state operations
  without explicit authorization.

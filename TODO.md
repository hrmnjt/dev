# TODO

## Gondolin

Merged to `main` and deployed: Pi and Claude already run in VMs. The remaining
host acceptance checks are closed or dropped; what's left is two image changes.
Setup, boundaries and checks live in the
[shared VM guide](gondolin/README.md#checks-and-remaining-acceptance); agent
specifics in [Pi](pi/README.md) and [Claude Code](claude/README.md).

### In progress

Close this before picking up the next item.

- [ ] Root disk: branch `feat/gondolin/larger-root-disk` grows it from 2.4 GiB
  (455 MiB free) to 16 GiB and adds `e2fsprogs` to the image. Build its image
  and check `df -h /` in a VM, then open a PR. 16 GiB is a starting guess, not
  a measurement: each session's disk layer is sparse and deleted on exit, so
  unused space costs the Mac nothing. Gondolin runs `resize2fs` (from
  `e2fsprogs`) in the VM at boot to grow the filesystem; the base image has it
  today, and listing it keeps a base update from dropping it.

### Next

- [ ] Chromium trust for Gondolin's CA: add `libnss3-tools` to the image (about
  6 MB) and, at boot, import `/etc/gondolin/mitm/ca.crt` (`gondolin-mitm-ca`)
  into `~/.pki/nssdb`. Tried in a VM on 2026-11-25: Playwright then loads
  external HTTPS without `ignoreHTTPSErrors`. The guest home is shared,
  host-backed state, so replace the entry by name at each boot (or keep
  `~/.pki` on a tmpfs). Then drop the `ignoreHTTPSErrors` advice from the
  guide. Its own branch, after the root disk merges.

### Checked

From a Claude VM on 2026-11-22, plus daily use:

- Pi and Claude have run in VMs for many working days.
- Pi: installer discovery and `pi update`, `VM <id>` before typing, and
  shutdown when the extension fails after loading (confirmed 2026-11-25).
- The running image matches the current source fingerprint.
- `.venv-vm` isolation is active, and writes to the deployed launcher source
  are refused.
- Playwright reaches external HTTPS only with `ignoreHTTPSErrors`.
- `main` requires PRs and blocks deletion and force pushes; recent commits
  merged through PRs. The repository is public, so private-repository ruleset
  support doesn't apply. The bypass-actor check was closed on 2026-11-25.

Earlier trials are in Git history; the reusable checks stay in the package
guides. Retiring the Mac Claude CLI, desktop app and Codex is a separate
decision.

## Rex

**Planned, not implemented; one delivery.** Actions, shortcuts and safety rules
stay as in [the Rex guide](rex/README.md#worktrees) unless an item says
otherwise.

### Goals

- Worktree questions appear in Rex's command palette instead of a temporary
  `fzf` menu session.
- Open shows where each worktree stands, so you can get back to the one you
  were last on and see what's left to finish or close it.
- Deleting a worktree stays at least as safe as today.
- Terminal preferences apply without quitting Rex.

### Phase 1

- [ ] **Native prompts.** New, Open, Delete and the project picker ask through
  `rex.ui.input` and `rex.ui.pick`. Done when the `rex-worktrees-*` helper
  sessions, the nested `rex do` launch and the `fzf` menu are gone; cancelling
  is silent while timeouts and other no-answer cases show as errors; and the
  shortcuts work with Remote Control turned off.
- [ ] **Worktree status list.** Open lists the current project's worktrees,
  newest activity first. Each row shows one next step from local Git and the
  tab's agent state: finish an operation in progress, answer the waiting agent,
  commit, push, close or rebase. Enter jumps to the tab or reopens it with one
  shell; a separate action opens the worktree in the editor (Zed for now). Done
  when a project with about 15 worktrees lists within the 30-second limit,
  without fetching, PR lookups or changing Git state, and the list says when
  `origin` was last fetched.
- [ ] **Safe deletion.** Done when the confirmation names the project, branch
  and path and lists any working or waiting programs in the tab; the tab closes
  for real before Git runs; `git worktree remove` runs detached, so a timeout or
  config reload can't leave a half-deleted checkout; a failed removal is
  reported clearly; and sibling tabs and the last-tab fallback behave as today.
- [ ] **Terminal preferences.** Done when the guide's preferences are applied
  with `client.setting.*` actions instead of the `defaults write` block.
- [ ] **Tests and docs.** Done when the fixture tests mock `rex.ui` and cover
  each no-answer case, a source tab that changes during a prompt, duplicate
  prevention, a failed removal and the status-list signals; the shortcuts have
  been tried on disposable worktrees on the Mac; and `rex/README.md` and the
  changelog describe the new behavior.

Example status list:

```text
CoreDataEngineering worktrees · origin fetched 3 hours ago     (example rows)
feat/app/example        2 hours ago · add cost tiles      push 2 · 3 changed
docs/model/example      yesterday · fix join keys         Claude waiting
chore/ingestion/example 4 days ago · drop old job         ready to close
```

### Notes

Design constraints from the Rex docs ([Custom UI](https://www.superlogical.com/rex/docs/customize/custom-ui),
[Custom Actions](https://www.superlogical.com/rex/docs/customize/actions),
[Lua API](https://www.superlogical.com/rex/docs/reference/lua),
[Server API](https://www.superlogical.com/rex/docs/reference/api); checked
2026-11-25): prompts need control API revision 17 (`rex api call
server.version`) and can't run under `pcall`, through `rex.invoke`, in event
handlers or in functions bound directly to keys. Actions get 30 seconds, not
counting prompt waits, and commands they start stop when they end. Prompts
reach every connected app, including other devices. An `undoable` tab close
keeps programs running for about a minute. PR merges here rewrite commits, so
"landed" needs `git cherry` and `[gone]` upstreams, not ancestry alone.

Not doing: PR lookups, bulk cleanup, reopening every worktree with its project,
a cross-project list, permanent watchers or stored state, agent-driven session
naming, or Rex access from Gondolin.

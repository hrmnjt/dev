# TODO

## Rex

**Planned, not implemented.** Actions, shortcuts and safety rules stay as in
[the Rex guide](rex/README.md#worktrees) unless an item says otherwise. Use
Rex's built-in views (Go to Anything, Activity, tab and pane history, undo
close) before building anything. Checked against Rex 0.1.0-preview.25 (control
API revision 24) on 2026-11-27.

### Goals

- New (Cmd+Shift+N) and Open (Cmd+Shift+O), the two most used actions, work
  entirely in Rex's command palette.
- Open shows where each worktree stands, so you can get back to the one you
  were last on and see what's left to finish or close it.
- Deleting a worktree stays at least as safe as today.
- After a Rex restart, tabs and panes come back by themselves, and Pi resumes
  its session; our own code no longer handles restart recovery.
- Terminal preferences apply without quitting Rex.

### Phase 1: New and Open

- [ ] **New (Cmd+Shift+N).** The palette asks for the branch name
  (`rex.ui.input`); outside a Git checkout it first asks for the project
  (`rex.ui.pick`). Branch rules stay: track an exact fetched remote branch,
  otherwise branch from local `main`, with no fetch. Done when the worktree
  opens as a focused tab in the project's session with no menu session or
  `fzf`; a blank or cancelled prompt does nothing; an invalid name asks again
  with the text kept and the reason shown; a branch that already exists offers
  to open it instead; and it works with Remote Control turned off.
- [ ] **Open (Cmd+Shift+O).** The palette lists this project's worktrees as
  status rows, newest activity first, with local branches that have no worktree
  below; outside a checkout it first asks for the project. Each row shows the
  branch, its last activity and commit, and one next step from local Git and
  the tab's agent state: finish an operation in progress, answer the waiting
  agent, commit, push, close or rebase. Enter focuses the tab, reopens a closed
  worktree with one shell, or creates the worktree for a branch. The old
  `[all worktrees]` row goes, since Rex restores tabs after a restart. Done when
  a project with about 15 worktrees lists within the 30-second limit, without
  fetching or changing Git state; the list says when `origin` was last fetched;
  it never opens a duplicate tab; and it works with Remote Control turned off.
- [ ] **Tests and docs for New and Open.** Done when the fixture tests mock
  `rex.ui` for both actions (each no-answer case, invalid and existing names,
  choosing a project outside a checkout, status-list signals, duplicate
  prevention); both shortcuts have been tried on disposable worktrees on the
  Mac; and `rex/README.md` and the changelog describe them.

Example status list:

```text
CoreDataEngineering worktrees · origin fetched 3 hours ago     (example rows)
feat/app/example        2 hours ago · add cost tiles      push 2 · 3 changed
docs/model/example      yesterday · fix join keys         Claude waiting
chore/ingestion/example 4 days ago · drop old job         ready to close
```

New and Open run inside their own actions and load the worktree module from
their own folder, so a branch trial never runs the deployed copy. Delete and
Projects keep today's menu session until Phase 2.

### Phase 2: the rest

- [ ] **Safe deletion (Cmd+Shift+Backspace).** Done when the native
  confirmation names the project, branch and path and lists any working or
  waiting programs in the tab; the tab closes for real before Git runs;
  `git worktree remove` runs detached, so a timeout or config reload can't leave
  a half-deleted checkout; a failed removal is reported clearly; and sibling
  tabs and the last-tab fallback behave as today.
- [ ] **Projects (Cmd+Shift+K).** The palette opens one listed project or a
  typed path; the `[all projects]` row goes. Done when the helper sessions, the
  nested `rex do` launch, the `fzf` menu and the open-all code are all gone.
- [ ] **Restart and resume.** `init.lua` sets resume rules on purpose: it limits
  the built-in Claude and Pi rules to `~/code` and turns off the rules for
  agents not used here (Codex, OpenCode, Gemini CLI, Copilot CLI, Crush). Done
  when `rex config check` lists only those rules, and after a Rex server
  restart the sessions, tabs and panes are back, Pi resumes in its session, and
  other panes are shells in their folders.
- [ ] **Terminal preferences.** Done when the guide's preferences are applied
  with `client.setting.*` actions instead of the `defaults write` block;
  `rex.set` covers only resume settings today.
- [ ] **Tests and docs.** Done when the fixture tests cover deletion (a source
  tab that changes during the prompt, a failed removal) and the project picker;
  and `rex/README.md` and the changelog describe Delete, Projects, Session
  Restore and undo close (Shift+Cmd+T), replacing the old restart-recovery
  steps.

### Notes

Design constraints from the Rex docs ([Custom UI](https://www.superlogical.com/rex/docs/customize/custom-ui),
[Custom Actions](https://www.superlogical.com/rex/docs/customize/actions),
[Lua API](https://www.superlogical.com/rex/docs/reference/lua),
[Server API](https://www.superlogical.com/rex/docs/reference/api); checked
2026-11-27): prompts need control API revision 17 (`rex api call
server.version`) and can't run under `pcall`, through `rex.invoke`, in event
handlers or in functions bound directly to keys. Actions get 30 seconds, not
counting prompt waits, and commands they start stop when they end. Prompts
reach every connected app, including other devices. An `undoable` tab close
keeps programs running for about a minute. PR merges here rewrite commits, so
"landed" needs `git cherry` and `[gone]` upstreams, not ancestry alone.

Restart behavior ([Session Restore](https://www.superlogical.com/rex/docs/features/session-restore),
[Resume Rules](https://www.superlogical.com/rex/docs/customize/resume-rules),
[Program Resume](https://www.superlogical.com/rex/docs/build/program-resume)):
a server restart restores every session, tab and pane with its label, and
re-runs a pane's program only when it reported a resume command (OSC 7577) and
a rule trusts it. Reports are signed with an `OSC7577_TOKEN` environment
variable. The Gondolin launcher forwards no Mac environment into VMs, and the
protocol advises against passing the token into containers, so agents in a VM
can't register resume commands. Claude in a VM comes back as a shell in its
worktree; run `claude -c` there. Resume records are saved in plain text, owner
only, under Rex's state directory; inspect a pane's with
`rex block call -b "$REX_BLOCK" program_resume_records`.

Not doing: PR lookups, bulk cleanup, reopening every worktree with its project,
custom restart recovery, automatic resume for Claude in VMs, a cross-project
list, permanent watchers or stored state, agent-driven session naming, or Rex
access from Gondolin.

# TODO

## Rex

Checked against Rex 0.1.0-preview.25 (control API revision 24).

- [ ] **Terminal preferences.** Apply the guide's preferences with Rex's
  `client.setting.*` actions instead of the `defaults write` block, so they
  apply without quitting Rex. Their arguments aren't documented; read them on
  the Mac with `rex -C <app> actions --json` (`rex client ls` names the app).
  An action can send them with `rex.client.queue`, which needs no Remote
  Control. Done when one palette action applies them all and the guide's
  `defaults write` block is gone.

Not doing: PR lookups, bulk cleanup, reopening every worktree with its project,
custom restart recovery, automatic resume for Claude in VMs, a cross-project
list, permanent watchers or stored state, agent-driven session naming, or Rex
access from Gondolin.

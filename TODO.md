# TODO

A working backlog for this setup. Start with Pi; use the same method for other
packages. Suggestions are candidates, not commitments.

## Method

1. **Capture:** add one idea, annoyance, or question to the inbox. No need to
   solve it yet.
2. **Decide:** give it a stable ID and record what you want, what you do not
   want, and why. Choose `undecided`, `investigate`, `accept`, `defer`, or
   `reject`. Keeping the current setup is a valid decision.
3. **Make it actionable:** only an accepted change becomes a task. State the
   smallest next action and an observable completion check. An investigation
   can become a bounded task without approving the eventual change.
4. **Pick the next task:** move at most three tasks into **Next**. Keep the
   rest in **Later**; do not assign priority just because a feature is new.
5. **Verify and close:** check the result, including host or interactive tests
   when needed. Mark the task done, update the package guide and root changelog
   for actual changes, and keep the decision rationale.

Use IDs such as `PI-01` or `META-01` so decisions and tasks can refer to each
other without repeating the discussion. Split an item if its parts can be
accepted or rejected independently. For deferred items, record what would make
it worth revisiting.

### Decision template

```markdown
### AREA-00 — Topic

- Status: undecided
- Problem / desired outcome:
- My opinion:
- Constraints / non-goals:
- Evidence needed:
- Decision / reason:
- Revisit when: (if deferred)
```

### Task template

```markdown
- [ ] AREA-00 — One concrete action
  - Scope: files or integration affected
  - Done when: observable result, not just "implemented"
  - Verify: sandbox checks; host / interactive checks if needed
  - Depends on: IDs, or none
```

## Inbox

Add raw thoughts here; move them into the decision list when ready.

_No untriaged items yet._

## Decisions — Pi release review

These topics came from the Pi 1.0 setup review and the sandbox migration
review. Only decisions marked `accept` are approved; implementation remains
future work. Verify release-specific behavior against the installed version
before implementing.

### PI-01 — Upgrade and compatibility

- Status: accept
- Problem / desired outcome: verify Pi 1.x compatibility before implementing
  the native sandbox; upgrade only if the installed version requires it.
- My opinion: accept the recommended compatibility-first approach, preserving
  the current workflow rather than enabling unrelated features during an upgrade.
- Constraints / non-goals: keep Gondolin active until the native replacement is
  verified; installation, deployment, and interactive checks happen on the host.
- Evidence needed: host `pi --version`; deployed settings and extensions; smoke
  tests for Gondolin, linked-worktree Git identity, `/answer`, `/review`,
  `/review-summary`, clipboard images, WAL, tldraw, and Herdr integration.
- Decision / reason: accepted. Establish a working baseline before changing
  execution environments so compatibility failures and migration failures can
  be distinguished. Approval is for future work, not an immediate upgrade.

### PI-02 — Codemode

- Status: undecided
- Problem / desired outcome: decide whether scripted tool composition improves
  real tasks enough to enable it; compare off, `on`, and `only`.
- My opinion:
- Constraints / non-goals: direct and scripted calls to standard tools must
  share the selected sandbox and uv guard: Gondolin today, the native sandbox
  after PI-14. Codemode must not introduce an unsandboxed host execution path.
  Planning for codemode compatibility does not decide whether to enable it.
- Evidence needed: a representative read-only task; correctness, latency,
  context size, and ease of reviewing nested calls.
- Decision / reason:

### PI-03 — Large tool output across the sandbox boundary

- Status: undecided
- Problem / desired outcome: ensure truncated-output references are actually
  readable by the agent when Pi writes overflow logs outside Gondolin.
- My opinion:
- Constraints / non-goals: do not mount the host temp directory broadly.
- Evidence needed: reproduce truncation; inspect the returned path; test a
  narrowly scoped solution if a fix is wanted. Recheck after PI-14: native
  execution may remove the host/guest path mismatch, but overflow artifacts
  must remain readable and covered by cleanup and access policy.
- Decision / reason:

### PI-04 — MCP: which capability is actually missing?

- Status: undecided
- Problem / desired outcome: identify a useful integration that existing
  sandboxed CLIs or focused bridges do not already provide.
- My opinion:
- Constraints / non-goals: host stdio MCP servers are not automatically
  sandboxed by the current Gondolin extension or a replacement that only wraps
  standard tools; assess credentials, execution location, exposed operations,
  and approval needs before enabling a server.
- Evidence needed: one concrete use case; server trust and permission review;
  choose direct, codemode, deferred, or hidden exposure deliberately.
- Decision / reason:

### PI-05 — Structured results and tool discovery

- Status: undecided
- Problem / desired outcome: decide whether tldraw and other custom tools need
  structured results, namespaces, or annotations for scripted use.
- My opinion:
- Constraints / non-goals: retain narrow host bridges and image delivery;
  avoid changing tool contracts without tests.
- Evidence needed: current result shapes; a script consuming them; direct and
  scripted screenshot behavior on a scratch canvas.
- Decision / reason:

### PI-06 — OpenAI authentication

- Status: undecided
- Problem / desired outcome: evaluate the newer ChatGPT login through the
  `openai` provider versus the existing `openai-codex` connection.
- My opinion:
- Constraints / non-goals: keep the working connection until an alternative
  has been tested; credentials stay host-local.
- Evidence needed: availability, authentication, usage limits, and a successful
  real task through the alternative provider.
- Decision / reason:

### PI-07 — Model scope and thinking defaults

- Status: undecided
- Problem / desired outcome: choose intentional cloud/local model cycling and
  thinking levels rather than following release defaults automatically.
- My opinion:
- Constraints / non-goals: distinguish tracked template settings from deployed
  runtime settings; do not assume the template is the current live selection.
- Evidence needed: available models; preferred task/model combinations; image
  support, latency, quality, and cost.
- Decision / reason:

### PI-08 — Local classifiers

- Status: undecided
- Problem / desired outcome: assess a bounded classification use case such as
  sorting review findings or worklog entries.
- My opinion:
- Constraints / non-goals: no automatic actions based solely on a classifier;
  model loading and memory costs count too.
- Evidence needed: a small labeled example set; accuracy and latency compared
  with the current workflow.
- Decision / reason:

### PI-09 — Automatic local/cloud routing

- Status: undecided
- Problem / desired outcome: decide whether virtual-model routing is worth
  the complexity compared with manual model selection.
- My opinion:
- Constraints / non-goals: no implicit transfer of sensitive local context to
  a cloud provider; account for cache misses and smaller context windows.
- Evidence needed: explicit routing/privacy policy and measurable benefit.
- Decision / reason:

### PI-10 — Persistent review checkpoints

- Status: undecided
- Problem / desired outcome: decide whether `/review-summary` should remember
  its last reviewed SHA across reloads, restarts, and session branches.
- My opinion:
- Constraints / non-goals: avoid treating abandoned-branch history as current;
  distinguish a review being requested from a review being completed.
- Evidence needed: desired checkpoint semantics; existing session entry APIs;
  restart, reload, branch navigation, and failed-review tests.
- Decision / reason:

### PI-11 — Pi Durable

- Status: undecided
- Problem / desired outcome: identify whether there is a real unattended,
  restartable workflow beyond ordinary session persistence.
- My opinion:
- Constraints / non-goals: experimental separate runtime, not a CLI toggle;
  side-effect replay needs explicit safety/idempotency design; preserve isolation.
- Evidence needed: a concrete workflow, restart requirements, storage ownership,
  execution-environment integration, and a small recovery test.
- Decision / reason:

### PI-12 — Extension maintenance

- Status: undecided
- Problem / desired outcome: decide whether to refresh legacy imports and
  `/answer`'s nested model-call and terminal-mode handling.
- My opinion:
- Constraints / non-goals: compatibility cleanup is not proof of breakage;
  keep behavior stable and use supported Pi APIs.
- Evidence needed: current API contracts; `/answer` with local/cloud models and
  any proposed virtual model; correct handling outside interactive TUI mode.
  PI-14 separately covers sandbox-dependent paths, prompts, and extension
  integration; it does not approve unrelated maintenance changes here.
- Decision / reason:

### PI-13 — Theme and terminal defaults

- Status: undecided
- Problem / desired outcome: choose between the exact custom Gruvbox palette
  and Pi's terminal-derived `system` theme; consider startup/display preferences.
- My opinion:
- Constraints / non-goals: fullscreen is already configured; new defaults do
  not require migration.
- Evidence needed: side-by-side host comparison, including review UI, images,
  selection, and narrow terminal widths.
- Decision / reason:

### PI-14 — Native sandbox replacing active Gondolin routing

- Status: accept
- Problem / desired outcome: use a native, Codex-style sandbox on the personal
  Mac. Allow normal edits in the active repository/worktree while blocking
  destructive filesystem operations elsewhere, without a Linux VM.
- My opinion: replace active Gondolin routing and update extensions to work
  with native execution; retain the Gondolin setup so it can be selected again
  if needed. Document now; do not implement in this session.
- Constraints / non-goals:
  - Preserve Herdr's live-worktree workflow; no copy-and-review staging area.
  - Base the implementation on Pi's official sandbox example, but protect
    `write` and `edit` as well as `bash`. Check canonical paths, symlink escapes,
    and new-file parent paths rather than treating cwd as confinement.
  - Direct tool calls and codemode calls must use the same enforcement and uv
    guard. There must be no automatic unsandboxed fallback on startup,
    dependency, or execution failure.
  - Agent-editable project configuration must not widen or disable the policy.
    Protect safety-sensitive runtime configuration and linked-worktree Git
    metadata; use intentional user/host Git operations where needed. Preserve
    fail-closed identity selection, with no fallback identity.
  - Keep user-entered `!` / `!!` commands host-side and retain explicit trusted
    integrations such as WAL and tldraw. These exceptions are not general host
    filesystem or shell tools.
  - Keep Gondolin's extension, dependencies, image definition, and setup notes.
    Use an explicit backend selector so only one backend registers tools;
    retaining an auto-discovered `gondolin.ts` alone does not disable it.
  - Target practical personal-machine protection, not enterprise hardening.
    Stow-linked files inside this checkout can affect live host configuration;
    do not describe the writable worktree as isolated from those effects.
- Evidence needed: PI-01 baseline; macOS sandbox-runtime dependencies and
  enforcement tests; extension and codemode smoke tests; explicit temporary
  artifact, cache, network, and Git-operation policies. Read the installed
  example and security docs before implementing, rather than copying its
  permissive configuration and fail-open behavior unchanged.
- Decision / reason: accepted as future work. Native execution fits the desired
  workflow; a retained, explicitly selectable Gondolin backend provides a
  rollback if the replacement proves unsuitable. No runtime behavior changes
  are part of this documentation update.
- References:
  - [Pi sandbox example](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/examples/extensions/sandbox/index.ts)
  - [Pi security guidance](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/security.md)
  - [Codex sandbox and approvals](https://developers.openai.com/codex/agent-approvals-security)

## Next

Approved future work only; do not start implementation as part of documenting
these decisions.

- [ ] PI-01 — Establish the Pi 1.x compatibility baseline
  - Scope: host Pi version, deployed settings/dependencies, existing extensions.
  - Done when: upgrade only if needed, and record passing checks for the
    existing workflow listed in PI-01 without enabling unrelated features.
  - Verify: host and interactive smoke tests; linked-worktree and unknown-path
    identity checks remain fail-closed.
  - Depends on: none.
- [ ] PI-14 — Build a fail-closed native tool backend with explicit selection
  - Scope: sandbox extension, `gondolin.ts`, shared uv guard, dependencies and
    trusted backend configuration; start from the official sandbox example.
  - Done when: only the selected backend registers tools; native `bash`,
    `write`, and `edit` enforce the worktree boundary, protected metadata, and
    deliberate temporary/cache policy. Reads and overflow logs remain usable.
    Startup failures block tool execution, and project settings cannot widen
    policy. Gondolin remains selectable without deleting its setup.
  - Verify: permitted workspace edits; blocked external writes/deletes; symlink
    escapes and nonexistent parents; protected policy/Git paths; initialization
    and dependency failures; direct calls and codemode calls; uv guard.
  - Depends on: PI-01.
- [ ] PI-14 — Adapt extensions and verify migration and rollback on the host
  - Scope: review/review-summary paths and generated prompts, clipboard images,
    WAL, tldraw, Herdr, Pi resource discovery, setup guides, agent instructions,
    and backend-aware doctor checks. Audit other extensions for VM assumptions.
  - Done when: native execution uses real host/worktree paths rather than
    `/workspace` and `/pi`; intended host integrations still work; checks report
    the selected backend; switching back restores the documented Gondolin
    workflow. Select native by default only after verification.
  - Verify: host macOS enforcement and interactive extension tests; linked
    Herdr worktrees, image results, overflow-log reads, reload/restart, and a
    full explicit switch back to Gondolin. No silent backend fallback.
  - Depends on: PI-01 and the PI-14 backend task.

## Later

No additional accepted tasks yet. Decide the remaining topics one at a time;
PI-14 compatibility requirements do not approve their optional features.

## Done

Completed task IDs and verification notes. Keep rejected/deferred ideas in the
decision list with their reason rather than treating them as unfinished work.

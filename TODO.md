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

- Status: accept
- Problem / desired outcome: enable optional scripted tool composition for
  batching calls and filtering results while keeping direct tools available.
- My opinion: accept `on`, not `only`; ordinary tasks should not require scripts.
- Constraints / non-goals: direct and scripted calls to standard tools must
  share the selected sandbox and uv guard: Gondolin today, the native sandbox
  after PI-14. Codemode must not introduce an unsandboxed host execution path.
  Script failures do not undo completed writes; begin with a read-only trial
  and verify nested calls before mutation-heavy use. No runtime changes now.
- Evidence needed: after PI-01, a representative read-only task; correctness,
  latency, context size, and ease of reviewing nested calls; sandbox routing,
  blocked-command behavior, failure handling, and overflow-log accessibility.
- Decision / reason: accepted as future work. `on` adds composition without
  forcing every tool call through a script. Validate with the active backend
  before enabling it and repeat the checks when PI-14 changes that backend.

### PI-03 — Large tool output across the sandbox boundary

- Status: defer
- Problem / desired outcome: ensure truncated-output references are readable
  by the agent; Gondolin can leave host-generated overflow logs outside the VM.
- My opinion: defer a standalone Gondolin fix; fold overflow-log accessibility
  checks for both `bash` and codemode into PI-14 migration verification.
- Constraints / non-goals: do not mount the host temp directory broadly or
  assume native execution guarantees access under the new sandbox policy.
- Evidence needed: during PI-14, reproduce truncated `bash` and codemode
  results and read their full-output paths; verify artifact cleanup and access
  policy without widening general host access.
- Decision / reason: native execution should remove the host/guest path
  mismatch, so a separate Gondolin workaround may be unnecessary. Verification
  remains required as part of PI-14, not as a standalone implementation task.
- Revisit when: overflow-log access remains broken after migration, or blocks
  current work before migration.

### PI-05 — Structured results and tool discovery

- Status: accept
- Problem / desired outcome: give custom data-returning tools explicit output
  schemas and matching structured results so codemode scripts consume objects
  rather than parsing human-readable text.
- My opinion: accept a focused update now as planned work alongside PI-02;
  structured results have a concrete use case once codemode `on` is accepted.
- Constraints / non-goals: preserve tool names, arguments, readable direct-call
  content, narrow host bridges, and screenshot image delivery. Use supported
  Pi `outputSchema` / `structuredContent` APIs, not renderer-only `details`.
  Add discovery metadata where useful without a namespace overhaul. Do not
  expose credentials, arbitrary host paths, or image bytes as text. No runtime
  changes during this decision session.
- Evidence needed: current tldraw and WAL result shapes; schema validation;
  scripts consuming successful and failed results; direct and scripted
  screenshot behavior on a scratch canvas, including image forwarding.
- Decision / reason: accepted as future work. Stable machine-readable outputs
  complement codemode batching and filtering while readable content preserves
  direct use. Limit changes to useful data contracts and verify compatibility.

### PI-06 — OpenAI authentication

- Status: accept
- Problem / desired outcome: migrate from the existing `openai-codex`
  connection to ChatGPT login through the newer `openai` provider.
- My opinion: migrate; provide the host login and migration instructions when
  implementing, not during this decision session.
- Constraints / non-goals: credentials stay host-local. Keep the working
  connection available until the new provider has been tested; do not change
  authentication or runtime settings now. PI-07 specifies `gpt-6.1-sol` with
  `high` thinking through the target `openai` provider; verify the exact model
  ID and support rather than silently substituting another model.
- Evidence needed: installed-version login support, available models and IDs,
  usage limits, extension compatibility, and a successful real task through
  the new connection.
- Decision / reason: accepted as future work. Validate login and model access,
  then update intentional provider/model references without exposing secrets.

### PI-07 — Model scope and thinking defaults

- Status: accept
- Problem / desired outcome: use the explicitly preferred default model and
  thinking level rather than adopting release defaults automatically.
- My opinion: migrate to `openai` per PI-06 and default to `gpt-6.1-sol` with
  `high` thinking. The pasted `openai-codex` label identified the current
  connection, not a requirement to retain that provider.
- Constraints / non-goals: record this as a requested default, not a claim that
  the model is available in the installed version or target provider. Distinguish
  tracked template settings from deployed runtime settings. Do not change
  settings now or alter the local model shortlist as part of this decision.
  Do not silently substitute another model or thinking level.
- Evidence needed: host model catalog and authentication after PI-06;
  availability of the exact model ID and `high` thinking through `openai`;
  startup/restart and real-task checks.
- Decision / reason: accepted as future configuration work. The user confirmed
  migration to `openai` while retaining the pasted model and thinking preference;
  other cycling/default changes are not approved.

### PI-08 — Local classifiers

- Status: defer
- Problem / desired outcome: assess a bounded classification use case such as
  sorting review findings or worklog entries.
- My opinion: maximize useful local-model usage, but skip classifiers for now;
  there is no clear use case or workflow yet.
- Constraints / non-goals: skipping classifiers does not reject local chat
  models. No automatic actions based solely on a classifier; model loading
  and memory costs count too.
- Evidence needed: a concrete task and small labeled example set; accuracy and
  latency compared with the current workflow.
- Decision / reason: deferred, not rejected. The broader preference for local
  models remains; specialized classification work is not approved now.
- Revisit when: a useful classification task and a practical local-model
  workflow have been identified.

### PI-09 — Automatic local/cloud routing

- Status: investigate
- Problem / desired outcome: maximize useful local chat-model usage and learn
  which tasks suit local versus cloud models before adding routing automation.
- My opinion: pursue a bounded local-first workflow investigation later;
  compare exploration, summaries, and straightforward tasks with cloud results.
- Constraints / non-goals: keep cloud handoffs explicit; no silent fallback or
  implicit transfer of private local context. Preserve PI-07's requested cloud
  default. Account for model-loading cost, cache misses, and smaller context
  windows. This does not approve automatic or virtual-model routing.
- Evidence needed: representative local/cloud task comparisons for quality,
  correctness, latency, memory/context limits, and cost; an explicit privacy
  and handoff policy; measurable benefit before proposing automation.
- Decision / reason: investigation accepted as later work. Establish a useful
  local-first workflow before deciding whether automation is worth adding.

### PI-10 — Persistent review checkpoints

- Status: accept
- Problem / desired outcome: let `/review-summary` retain its review checkpoint
  across reloads and restarts while respecting the active session branch.
- My opinion: persist checkpoints in the Pi session, not a global state file;
  distinguish a requested review from a completed review.
- Constraints / non-goals: abandoned session branches must not affect the
  current checkpoint. Do not advance the completed checkpoint just because a
  kickoff prompt was sent; failed, cancelled, or unfinished reviews must not
  cause commits to be skipped. No runtime changes in this decision session.
- Evidence needed: supported session entry APIs, explicit completion semantics,
  and checkpoint validity when the Git branch/history changes; restart, reload,
  session-branch navigation, and failed-review tests.
- Decision / reason: accepted as future work. Session-local, branch-aware
  persistence preserves review continuity without falsely marking work done.

### PI-11 — Pi Durable

- Status: defer
- Problem / desired outcome: identify whether there is a real unattended,
  restartable workflow beyond ordinary session persistence.
- My opinion: do not worry about Pi Durable for now; there is no current
  unattended workflow requiring it.
- Constraints / non-goals: experimental separate runtime, not a CLI toggle;
  side-effect replay needs explicit safety/idempotency design; preserve isolation.
- Evidence needed: a concrete workflow, restart requirements, storage ownership,
  execution-environment integration, and a small recovery test.
- Decision / reason: deferred. Ordinary Pi sessions and the planned PI-10
  checkpoints address interactive continuity without a separate runtime.
- Revisit when: a concrete unattended job needs automatic recovery beyond
  ordinary session persistence.

### PI-12 — Extension maintenance

- Status: accept
- Problem / desired outcome: refresh legacy imports and improve `/answer`'s
  nested model-call, error, and terminal-mode handling using supported Pi APIs.
- My opinion: accept focused compatibility maintenance, preserving the current
  workflow rather than rewriting extensions or adding unrelated features.
- Constraints / non-goals: compatibility cleanup is not proof of breakage.
  Keep behavior stable; use supported Pi APIs and current package imports.
  PI-14 owns sandbox-dependent paths, prompts, and backend integration; avoid
  duplicating that work here. No runtime changes in this decision session.
- Evidence needed: installed API contracts and applicable examples; `/answer`
  with local/cloud models, cancellation and provider failures, malformed
  extraction results, and correct handling outside interactive TUI mode.
  Test virtual models only if they are separately approved later.
- Decision / reason: accepted as future work. Small, tested maintenance makes
  the extensions easier to support without a framework rewrite.

### PI-13 — Theme and terminal defaults

- Status: accept
- Problem / desired outcome: preserve the current Pi appearance and terminal
  experience rather than adopting new release defaults automatically.
- My opinion: keep the custom Gruvbox Dark Hard theme and fullscreen TUI.
- Constraints / non-goals: no switch to the terminal-derived `system` theme,
  unrelated startup/display changes, or palette redesign. Compatibility and
  sandbox work must preserve the existing experience.
- Evidence needed: during implementation, host smoke tests for the existing
  theme, review UI, images, selection, and narrow terminal widths.
- Decision / reason: accepted: keep the current experience. The palette is
  intentional and coordinated across apps; new defaults do not require
  migration. No separate appearance-change task is needed.

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
    Herdr worktrees, image results, truncated `bash` and codemode results with
    readable full-output paths (PI-03), artifact cleanup/access policy,
    reload/restart, and a full explicit switch back to Gondolin. No silent
    backend fallback.
  - Depends on: PI-01 and the PI-14 backend task.

## Later

- [ ] PI-02 — Validate and enable codemode `on`, retaining direct tools
  - Scope: intentional settings template, host-local runtime settings, and
    selected backend tool routing; document activation and rollback.
  - Done when: a read-only comparison demonstrates correct nested tool calls,
    sandbox routing, uv blocking, and readable overflow artifacts; enable `on`
    only after those checks pass. Do not select `only`.
  - Verify: host trial, direct versus scripted results, script/tool failures,
    and scratch-worktree mutation tests before mutation-heavy use. Repeat
    backend checks after PI-14; partial writes are not automatically undone.
  - Depends on: PI-01; revalidation on PI-14.

- [ ] PI-05 — Add structured outputs to custom data-returning tools
  - Scope: tldraw search/exec results, WAL append results, and screenshot result
    handling; supported discovery metadata where useful.
  - Done when: applicable tools declare output schemas and return matching
    structured values; scripts consume fields without text parsing. Existing
    names/arguments and readable direct results remain compatible; screenshots
    still reach vision models as images rather than text or inaccessible paths.
  - Verify: schema and error-contract tests; direct versus codemode results;
    scratch-canvas search/edit/save/screenshot and controlled WAL append tests
    on the host. No token leakage or expansion of host access.
  - Depends on: PI-01; use PI-02 trial tooling for scripted verification.

- [ ] PI-06 — Migrate ChatGPT authentication to the `openai` provider
  - Scope: host-local login, intentional model references/settings, and setup
    documentation; check extensions for provider-specific assumptions.
  - Done when: provide version-correct host instructions during implementation,
    the user completes login, and the new provider passes a real-task test.
    Update model references only after confirming the available IDs; retain
    the old connection until validation succeeds.
  - Verify: authentication, model availability/limits, a real task, image input
    where supported, and affected extensions. Never copy credentials into Git
    or request that the user paste secrets into the conversation.
  - Depends on: PI-01; coordinate the requested model/thinking defaults with PI-07.

- [ ] PI-07 — Configure the requested default model and thinking level
  - Scope: intentional settings template and host-local runtime settings.
  - Done when: after PI-06 and confirming the target provider's exact model ID,
    the default is `openai` with the requested `gpt-6.1-sol` and `high` thinking.
    If unavailable, ask the user rather than choosing an alternative silently.
  - Verify: host catalog, model selection, fresh-session/restart defaults, and
    a real task. Preserve the local shortlist and unrelated runtime settings.
  - Depends on: PI-01 and PI-06.

- [ ] PI-09 — Investigate a practical local-first workflow
  - Scope: available local chat models, representative tasks, manual selection,
    and explicit cloud handoffs; no automatic router implementation.
  - Done when: record local/cloud comparisons and recommend which tasks can
    use local models reliably, with a clear privacy/handoff policy. Bring any
    automatic-routing proposal back as a separate decision.
  - Verify: host trials for exploration, summaries, and straightforward tasks;
    compare correctness, quality, latency, loading/memory cost, and context
    limits. Preserve PI-07's default and avoid silent cloud fallback.
  - Depends on: PI-01; use PI-06/PI-07's verified cloud model for comparisons.

- [ ] PI-10 — Persist branch-aware review checkpoints in the Pi session
  - Scope: `review-summary.ts`, supported session entries, and review docs.
  - Done when: reload/restart restores the active session branch's checkpoint;
    requested and completed reviews are distinct, with a defined confirmation
    mechanism. Only confirmed completion advances the completed checkpoint;
    stale checkpoints from unrelated Git history are not silently reused.
  - Verify: first/repeated reviews, reload/restart, session branching/navigation,
    Git branch/history changes, and failed/cancelled/unfinished reviews. No
    checkpoint contamination from abandoned session branches.
  - Depends on: PI-01; preserve PI-14-compatible worktree paths.

- [ ] PI-12 — Refresh extension APIs and harden `/answer` handling
  - Scope: legacy package imports and `/answer` model-call, error/cancellation,
    result-validation, and terminal-mode handling; related extension docs.
  - Done when: affected extensions use supported installed-version APIs and
    current package imports; `/answer` preserves its interactive workflow and
    handles unavailable models, failed/cancelled extraction, malformed results,
    and non-TUI invocation clearly. No framework rewrite or unrelated features.
  - Verify: API/type checks where available, host local/cloud extraction tests,
    interactive submit/cancel tests, and non-TUI behavior. Coordinate sandbox
    paths and backend integration with PI-14 rather than duplicating changes.
  - Depends on: PI-01; coordinate migrated cloud-provider tests with PI-06/PI-07.

Decide the remaining topics one at a time; accepted changes do not approve
other optional features.

## Done

Completed task IDs and verification notes. Keep rejected/deferred ideas in the
decision list with their reason rather than treating them as unfinished work.

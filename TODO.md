# TODO

Decisions and future work for this setup. **Documentation only:** Gondolin stays
active; no runtime, authentication, settings, or deployment changes yet.

## Method

- Capture ideas, then decide one at a time using stable IDs (`PI-01`, `META-01`).
- Record the choice and reason: `undecided`, `investigate`, `accept`, `defer`,
  or `reject`. Suggestions are not commitments; keeping the setup is valid.
- Turn accepted changes or bounded investigations into tasks with a completion
  check, verification, and dependencies. Keep at most three tasks in **Next**.
- Verify against installed APIs and on the host where necessary. Record results,
  close tasks, and update package docs/changelog. Revisit deferred items only
  when their stated trigger applies.

## Pi decisions

| ID | Status | Decision / reason |
|---|---|---|
| PI-01 | accept | Establish Pi 1.x compatibility before migration; upgrade only if needed so compatibility and sandbox failures can be distinguished. |
| PI-02 | accept | Codemode `on`, not `only`: allow batching/filtering while keeping direct tools. Validate sandbox routing before activation. |
| PI-03 | defer | No standalone Gondolin overflow-log workaround; test `bash` and codemode full-output paths during PI-14. Revisit if still broken or blocking current work. |
| PI-05 | accept | Structured custom-tool results for scripts, preserving readable direct results, tool names/arguments, narrow bridges, and screenshot images. |
| PI-06 | accept | Migrate ChatGPT login from `openai-codex` to `openai`; provide host instructions during implementation and retain the old connection until verified. |
| PI-07 | accept | Default to `openai` / `gpt-6.1-sol` with `high` thinking after confirming availability. No silent alternative; preserve the local shortlist. |
| PI-08 | defer | Skip local classifiers: no concrete task yet. Revisit with a useful classification workflow; this does not reject local chat models. |
| PI-09 | investigate | Maximize useful local-model use through local-first trials. Automatic/virtual-model routing is not approved; cloud handoffs stay explicit. |
| PI-10 | accept | Persist session-local, branch-aware review checkpoints; separate requested and confirmed-completed reviews so unfinished work is not skipped. |
| PI-11 | defer | Skip Pi Durable: no unattended recovery use case. Revisit when an actual job needs more than ordinary session persistence. |
| PI-12 | accept | Focused supported-API/import and `/answer` maintenance, preserving behavior. No framework rewrite; compatibility cleanup is not proof of breakage. |
| PI-13 | accept | Keep custom Gruvbox Dark Hard and fullscreen. No `system` theme migration or unrelated startup/display changes. |
| PI-14 | accept | Native, Codex-style worktree-write sandbox; adapt extensions and retain explicit Gondolin rollback. Practical personal-machine protection, not enterprise hardening. |

PI-04 (MCP) was removed: no current use case. IDs remain stable.
The requested PI-07 model is a preference, not a claim of provider availability.

## Native sandbox contract — PI-14

- Use Pi's official sandbox example as a starting point, not its permissive
  configuration or fail-open behavior unchanged.
- Preserve Herdr's live-worktree workflow; no copy-and-review staging area.
  Confine destructive filesystem operations to the active repository/worktree.
- Enforce `bash`, `write`, and `edit`, including canonical paths, symlink escapes,
  and nonexistent parent paths. Cwd alone is not confinement. Keep reads usable.
- Direct calls and codemode must share enforcement and the uv guard. Fail closed
  on dependency, startup, or execution errors; never fall back to host tools.
- Agent-editable project settings cannot widen/disable policy. Protect safety
  configuration and Git metadata, including linked-worktree common directories;
  use explicit user/host Git operations where needed. Preserve fail-closed Git
  identity with no fallback identity.
- Define temporary-artifact, cache, network, and Git-operation policies before
  activation. Overflow logs must be readable without broadly exposing host temp.
- Keep user-entered `!` / `!!` host-side, plus trusted WAL/tldraw integrations.
  These exceptions must not become general host shell/filesystem tools.
- Retain Gondolin extension, dependencies, image definition, and setup notes.
  Select exactly one backend explicitly; keeping an auto-discovered extension
  file alone does not disable it. Select native only after host verification.
- Writable Stow-linked checkout files can affect live host configuration; do not
  claim the worktree is isolated from those effects.

## Next

- [ ] **PI-01 — Establish the compatibility baseline**
  - Check host `pi --version`, deployed settings/dependencies, and installed API
    contracts; upgrade only if needed, without unrelated feature activation.
  - Verify Gondolin, linked-worktree/unknown-path Git identity, `/answer`,
    `/review`, `/review-summary`, clipboard images, WAL, tldraw, and Herdr.
    Record results before migration. Depends on: none.

- [ ] **PI-14 — Build the native backend and explicit selector**
  - Scope: sandbox/Gondolin extensions, dependencies, trusted backend policy,
    and shared uv guard. Done when the contract above holds with one backend
    registering tools, usable reads, and Gondolin still selectable.
  - Verify workspace edits; blocked external writes/deletes; symlinks/new parents;
    protected policy/Git paths; startup/dependency failure; direct/codemode calls;
    and uv blocking. Depends on: PI-01.

- [ ] **PI-14 — Adapt extensions and verify migration/rollback**
  - Audit all extensions for VM assumptions. Update review prompts/paths, Pi
    resource discovery, clipboard/WAL/tldraw integration, Herdr, agent/setup
    guides, and backend-aware doctor checks to use actual native paths.
  - Done when host macOS enforcement and interactive tests pass, including
    linked Herdr worktrees, images, `bash`/codemode overflow-log reads and cleanup
    (PI-03), reload/restart, and an explicit switch back to Gondolin.
    Depends on: PI-01 and the backend task.

## Later

- [ ] **PI-02 — Validate and enable codemode `on`**
  - Scope: settings template, host runtime settings, and activation/rollback docs.
    Done when a read-only comparison validates nested routing, uv blocking,
    overflow access, and failure handling before activation.
  - Verify direct/scripted results and scratch-worktree mutations before heavier
    use; script failures do not undo writes. Depends on: PI-01; retest after PI-14.

- [ ] **PI-05 — Add structured custom-tool outputs**
  - Scope: tldraw search/exec, WAL results, screenshot handling, and useful
    discovery metadata; no namespace overhaul. Use supported `outputSchema` /
    `structuredContent`, not renderer-only `details`; preserve direct contracts.
  - Done when scripts consume fields without text parsing. Verify schema/error
    contracts, direct/scripted results, scratch-canvas save/screenshots, and a
    controlled host WAL append. Preserve image forwarding; no credential leaks,
    arbitrary host-path exposure, or image bytes as text. Depends on: PI-01;
    use PI-02 trial tooling for verification.

- [ ] **PI-06 — Migrate OpenAI login**
  - Provide version-correct host instructions during implementation. The user
    logs in; verify model availability/limits, a real task, supported image input,
    and provider-dependent extensions before replacing the working connection.
  - Credentials remain host-local, never in Git or chat. Update intentional
    provider/model references and docs. Depends on: PI-01; coordinate with PI-07.

- [ ] **PI-07 — Set the requested model/thinking default**
  - Scope: template and host runtime settings. Done when verified `openai` /
    `gpt-6.1-sol` / `high` defaults survive fresh sessions and restarts and pass a
    real task. If unavailable, ask rather than substitute; keep unrelated settings
    and local models. Depends on: PI-01 and PI-06.

- [ ] **PI-09 — Investigate a local-first workflow**
  - Compare local/cloud exploration, summaries, and straightforward tasks for
    correctness, quality, latency, loading/memory cost, and context limits.
  - Done when useful local task choices and a privacy/handoff policy are recorded.
    Preserve PI-07's cloud default; no silent fallback or implicit transfer of
    private local context. Automation needs a separate decision.
    Depends on: PI-01; use PI-06/PI-07's verified cloud model for comparison.

- [ ] **PI-10 — Persist review checkpoints**
  - Scope: `review-summary.ts`, supported session entries, and docs. Done when
    restart/reload restores the active session branch's state, with explicit
    completion confirmation; only confirmed completion advances the checkpoint.
  - Verify branching/navigation, changed Git history, failed/cancelled/unfinished
    reviews, and no abandoned-branch contamination. Depends on: PI-01;
    coordinate worktree paths with PI-14.

- [ ] **PI-12 — Refresh APIs and `/answer` handling**
  - Update legacy imports to current supported APIs; preserve the interactive
    workflow and handle unavailable models, cancellation/provider errors,
    malformed extraction, and non-TUI invocation clearly. Update related docs.
  - Verify API/type checks, host local/cloud extraction, submit/cancel, and
    non-TUI behavior. Virtual models require separate approval. Depends on:
    PI-01; coordinate provider tests with PI-06/PI-07 and backend work with PI-14.

## Implementation references

- [Pi sandbox example](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/examples/extensions/sandbox/index.ts)
- [Pi security guidance](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/security.md)
- [Codex sandbox and approvals](https://developers.openai.com/codex/agent-approvals-security)

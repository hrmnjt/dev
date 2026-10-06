# TODO

Decisions and future work for this setup. **Native is the only sandbox on this
feature branch**, per the revised PI-14 choice. The initial restricted policy
passed macOS tests; the user-approved Gondolin-parity correction is now applied
and passes the revised host enforcement suite and doctor.
Authentication, models and appearance are unchanged. Codemode `on` is validated
and enabled in the template and host runtime; fresh default startup is verified.

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
| PI-03 | defer | No standalone overflow-log workaround; test native `bash` and codemode full-output paths during PI-14. Revisit if still broken or blocking current work. |
| PI-05 | accept | Structured custom-tool results for scripts, preserving readable direct results, tool names/arguments, narrow bridges, and screenshot images. |
| PI-06 | accept | Migrate ChatGPT login from `openai-codex` to `openai`; provide host instructions during implementation and retain the old connection until verified. |
| PI-07 | accept | Default to `openai` / `gpt-6.1-sol` with `high` thinking after confirming availability. No silent alternative; preserve the local shortlist. |
| PI-08 | defer | Skip local classifiers: no concrete task yet. Revisit with a useful classification workflow; this does not reject local chat models. |
| PI-09 | investigate | Maximize useful local-model use through local-first trials. Automatic/virtual-model routing is not approved; cloud handoffs stay explicit. |
| PI-10 | accept | Persist session-local, branch-aware review checkpoints; separate requested and confirmed-completed reviews so unfinished work is not skipped. |
| PI-11 | defer | Skip Pi Durable: no unattended recovery use case. Revisit when an actual job needs more than ordinary session persistence. |
| PI-12 | accept | Focused supported-API/import and `/answer` maintenance, preserving behavior. No framework rewrite; compatibility cleanup is not proof of breakage. |
| PI-13 | accept | Keep custom Gruvbox Dark Hard and fullscreen. No `system` theme migration or unrelated startup/display changes. |
| PI-14 | accept | Native-only launch-directory write confinement, matching Gondolin's mounted cwd, with private scratch and linked Git metadata exceptions. Preserve Git/network capabilities and editable Pi source; no added offline/read-only-Git policy. Recovery is host Git/deployment, not a runtime selector. |

PI-04 (MCP) was removed: no current use case. IDs remain stable.
The requested PI-07 model is a preference, not a claim of provider availability.

## Native sandbox contract — PI-14

- Preserve Gondolin's actual boundary: the canonical directory where Pi starts,
  not an automatically widened Git root. Keep Herdr's live-worktree workflow;
  no copy-and-review staging area for project edits.
- Constrain filesystem writes through `bash`, `write`, and `edit`; follow canonical
  paths, symlinks and nonexistent parents. No unsandboxed fallback. Share routing
  and the uv guard with nested/codemode calls.
- Permit private scratch/cache and discovered Git metadata outside launch cwd,
  matching the old linked-common-directory mount. Use bash Git commands for
  staging, commits, fetch and push when requested, not hand-edits through file
  tools. Preserve configured personal/work/linked identity, with no fallback.
- Do not add offline mode, read-only Git, Pi-source locks or arbitrary project
  config-based policy overrides. Stow-linked Pi source is editable inside the
  launch boundary; edits affect new/reloaded sessions everywhere, not already-
  loaded rules. Outside projects cannot write those targets through aliases.
- Use Seatbelt directly: the previous sandbox-runtime imposed additional
  mandatory locks. Keep its filesystem startup self-test, pinned private scratch,
  image behavior and owned overflow cleanup, without its proxy/npm dependency.
- Preserve normal reads, CLI authentication and networking/SSH. Keep the old dev
  model-cache exclusion when inside cwd. Do not print credentials or send private
  files to services without approval; this is not VM/read/credential isolation.
- Keep user-entered `!` / `!!` host-side and the narrow WAL/tldraw integrations.
  Host services/extensions can cause outside effects through IPC/network; the
  profile confines this process's filesystem writes, not all remote effects.
- Native remains mandatory on this branch; VM setup and selector stay removed.
  Recovery is deliberate host Git/deployment. Global installs, Stow, launchd,
  VPN and local-model management remain user tasks.

## Verification snapshot

- Host reports Pi **1.0.0**; no upgrade needed. Historical VM package versions
  were **0.12.0**; those dependencies are removed, not upgraded.
- Native-only tools, backend-free host paths, private scratch, shared uv guard,
  bridge guidance, doctor, and deployment cleanup are implemented.
- Initial native APIs type-checked against Pi 1.0.0 / sandbox-runtime 0.0.78;
  that check predates the write-only correction.
- Host deployment, retired dangling-link cleanup, npm installation, and the
  `/sandbox` startup self-test succeeded, as reported by the user.
- Initial restricted-policy host suite: **16 passed, 0 failed, 1 expected skip**.
  This is historical evidence, not proof of the corrected profile.
- The host applied the corrected policy/footer/manifest patch and removed five
  retired npm packages; audit reports **0 vulnerabilities**. Policy/registry and
  Stow tests against the candidate: **22 passed, 0 failed, 1 expected skip**. Syntax
  checks pass, and Pi 1.0's official loader loads all five changed extension
  factories without warnings. BSD patch round-trip matches all seven files.
  Corrected host kernel rerun: **1 passed, 0 failed**, after changing the fixture's
  `core.hooksPath=.` to absolute `.git/hooks` (no policy change). Kernel file
  confinement/editable source, Git/hooks, loopback/Unix sockets, narrow launches,
  linked-worktree commits, images, overflow and cleanup pass. Initial combined
  host suite: **23 passed, 0 failed, 1 expected skip**; updated full host suite:
  **46 passed, 0 failed, 1 expected skip**, including real Seatbelt enforcement. All tracked TypeScript
  extensions now pass strict semantic checking against Pi 1.0.0 declarations
  (installed dependency checking skipped); compiler tooling is private scratch. The current outer sandbox denies nested `sandbox_apply`, so enforcement
  trials run on the host.
- Tests now cover editable Pi source, narrow launch subdirectories, direct Git
  file-tool guards, bash Git/config/hooks, linked metadata writes, ordinary reads,
  normal networking/SSH-agent-style sockets, images and overflow cleanup.
- Final host doctor: **24 passed, 0 failed, 0 warnings**. Pi deployment/settings,
  Stow links, personal/work/unknown/linked Git identity, Herdr installation and
  GitHub CLI authentication pass. The folded-directory Stow false positive is
  resolved; six regression cases also pass.
- Live model tools: direct write/edit/read, bash, and read-only Git status work.
  Apple's Git launcher emits denied `xcrun_db` temp-cache warnings but returns
  results; this remains a usability issue, not an enforcement bypass.
- Reloaded tldraw tools pass live structured search/exec, direct exec output,
  saved local scratch-canvas edits, JPEG forwarding via `image(shot.image)`, and
  app-error rejection. No new lints; the disposable probe was removed and
  `scratch.tldraw` restored to zero shapes/bindings with no unsaved changes.
  No other canvas touched; no credentials or image bytes printed as text.
- Approved WAL test append passes on 20261006: scripts consume typed fields
  without parsing text, 68 appended bytes reported for the existing daily note,
  and a read-only exact-tail check verifies the approved line. PI-05 complete.
- Fresh-process `/sandbox` confirms the revised launch boundary, private scratch,
  bash Git metadata exception and unrestricted network/IPC profile are loaded.
- Pending: remaining interactive flows, Herdr workflow and complete
  reload/cleanup checks. Read-only GitHub SSH access is verified below. Npm cleanup/audit confirmation is complete: the
  sandbox-runtime/node-forge dependency is removed, not patched.
  See `pi/README.md`; this is not yet merge-verified.
- Live codemode trial passes nested read/write/edit and direct-read comparison,
  uv rejection, structured nonzero exits, >1 MiB output/full-output reads,
  file-tool and bash external-write rejection against an SDK-owned log, and
  preservation of completed writes after script failure. Probe cleaned up.
  Template and host runtime enable `codemode` with mode `on`; fresh startup
  without `--tools` confirms codemode and direct tools are available.
  No classifiers or image-generation models used.
- Latest non-kernel suite: **45 passed, 0 failed, 1 expected skip**. All ten
  tracked extension factories load via Pi's official loader without errors, and
  all tracked TypeScript extensions pass strict semantic checking. In-session
  repository doctor: **12 passed, 0 failed, 0 warnings**, with expected `_models`
  traversal denial. GitHub SSH `git ls-remote origin HEAD` succeeds; no fetch,
  push or local-ref mutation performed. Subsequent user host Stow succeeds;
  updated full suite: **46 passed, 0 failed, 1 expected skip**, including real
  Seatbelt enforcement. Full doctor rerun: **24 passed, 0 failed, 0 warnings**.
  Live command checks remain.
- Live catalog confirms `openai/gpt-6.1-sol` text/image/reasoning metadata;
  requested provider is not authenticated. No loaded local chat model available.
  Defaults and authentication unchanged; staged host/login and privacy-safe
  local-first trial instructions are in `pi/README.md`.
- User requested continuing all accepted TODO items after this correction;
  enable codemode only after routing/failure checks, then structured results,
  review checkpoints and `/answer` maintenance. Provider/model changes still
  require user login and availability verification; never substitute PI-07.

## Next

- [ ] **PI-01 — Verify compatibility on the host**
  - Versions/API contracts checked; verify deployed settings/dependencies without
    unrelated activation. Check Git identities (including linked/unknown paths),
    `/answer`, `/review`, `/review-summary`, images, WAL, tldraw, and Herdr.
    Record results. Depends on: none.

- [x] **PI-14 — Verify the native-only backend**
  - Core kernel enforcement, direct/codemode routing and failure/uv checks pass;
    updated full host suite and doctor are green. Remaining interactive migration
    and compatibility checks are tracked separately below.
  - Implementation/removal complete; done when the contract above is verified
    on macOS with one mandatory set of tools and no host fallback.
  - Verify workspace edits; blocked external writes/deletes; symlinks/new parents;
    editable Pi source and bash Git metadata; startup/launcher failure; direct/codemode calls;
    and uv blocking. Depends on: PI-01.

- [ ] **PI-14 — Verify the deployed migration**
  - Adapted prompts/paths, discovery, clipboard/WAL/tldraw guidance, Herdr,
    agent/setup guides, and doctor; remove stale deployed files before trials.
  - Done when macOS enforcement and interactive checks pass, including linked
    Herdr worktrees, images, overflow-log access/cleanup (PI-03), reload/restart,
    unchanged auth/models/appearance, and an ordinary `pi` launch.
    Depends on: PI-01 and the backend task. Record results before merging.

## Later

- [x] **PI-02 — Validate and enable codemode `on`**
  - Template, host settings and activation/rollback docs implemented; live
    routing/failure/overflow trial passes. Fresh startup without `--tools`
    confirms codemode and direct tools; user-applied settings preserve preferences.
  - Scope: settings template, host runtime settings, and activation/rollback docs.
    Done when a read-only comparison validates nested routing, uv blocking,
    overflow access, and failure handling before activation.
  - Verify direct/scripted results and scratch-worktree mutations before heavier
    use; script failures do not undo writes. Depends on: PI-01; retest after PI-14.

- [x] **PI-05 — Add structured custom-tool outputs**
  - Implemented schemas/structured results for WAL, tldraw search/exec and
    screenshots; guide stays text-based with read-only discovery hints. Six
    schema/serializer/validation/SDK QuickJS tests pass. Reloaded live tools also
    pass scripted search/exec fields, direct exec output, scratch-canvas save,
    visible JPEG forwarding and app-error rejection. Probe removed, empty canvas
    saved, no new lints. Explicitly approved WAL append passes on 20261006:
    structured fields consumed without text parsing and approved line verified
    at the note's end; no duplicate append or arbitrary external write.
  - Scope: tldraw search/exec, WAL results, screenshot handling, and useful
    discovery metadata; no namespace overhaul. Use supported `outputSchema` /
    `structuredContent`, not renderer-only `details`; preserve direct contracts.
  - Done when scripts consume fields without text parsing. Verify schema/error
    contracts, direct/scripted results, scratch-canvas save/screenshots, and a
    controlled host WAL append. Preserve image forwarding; no credential leaks,
    arbitrary host-path exposure, or image bytes as text. Depends on: PI-01;
    use PI-02 trial tooling for verification.

- [ ] **PI-06 — Migrate OpenAI login**
  - Version-correct `/login openai` host instructions documented. Live catalog
    contains the exact requested model, but authentication is missing; retain
    the working connection until real requests/provider checks pass.
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
  - Bounded nonprivate fixture comparison/privacy policy documented; no loaded
    local model currently available. Pending deliberate user router/model setup
    and verified cloud login/default, then real correctness/latency/memory trials.
    No routing or local-service/model state changes made.
  - Compare local/cloud exploration, summaries, and straightforward tasks for
    correctness, quality, latency, loading/memory cost, and context limits.
  - Done when useful local task choices and a privacy/handoff policy are recorded.
    Preserve PI-07's cloud default; no silent fallback or implicit transfer of
    private local context. Automation needs a separate decision.
    Depends on: PI-01; use PI-06/PI-07's verified cloud model for comparison.

- [ ] **PI-10 — Persist review checkpoints**
  - Implemented branch-aware custom-entry requests/completions, pinned ranges,
    explicit `complete [base]` and scoped `reset [base]`. Six real-Git/SDK tests
    and strict semantic type-check pass. Host Stow/new-helper deployment and
    updated full tests pass. Pending: interactive reload/restart, completion
    and tree-navigation verification.
  - Scope: `review-summary.ts`, supported session entries, and docs. Done when
    restart/reload restores the active session branch's state, with explicit
    completion confirmation; only confirmed completion advances the checkpoint.
  - Verify branching/navigation, changed Git history, failed/cancelled/unfinished
    reviews, and no abandoned-branch contamination. Depends on: PI-01;
    coordinate worktree paths with PI-14.

- [ ] **PI-12 — Refresh APIs and `/answer` handling**
  - Implemented official imports, provider-neutral extraction, validation/bounds,
    distinct error/cancel outcomes, non-TUI rejection and stale-session/model
    guards. Fixed editor themes/focus and review fullscreen mouse contracts.
    Nine regression tests and all-extension strict semantic checking pass.
    Pending: real local/cloud extraction, interactive submit/cancel and review.
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

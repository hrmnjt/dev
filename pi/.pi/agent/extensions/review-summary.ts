/**
 * Review Summary - Step-by-step PR review kickoff with rubric
 *
 * This preserves the original non-TUI review flow separately from the
 * terminal-native `/review` UI.
 *
 * Usage:
 *   /review-summary              compare current branch against main
 *   /review-summary develop      compare current branch against develop
 *
 * The command sends a structured prompt to pi with commit/file/diff-stat
 * context and a review rubric. The model then uses tools to inspect the code
 * and returns a concise summary, findings, and reviewer callouts.
 */

import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { hasFinishedResponse, readReviewState, REVIEW_ENTRY, type ReviewCheckpoint } from "./lib/review-state.ts";

const REVIEW_RUBRIC = `## Review Guidelines

Inspect the diff and relevant surrounding code with tools before writing the
final review. Briefly show the key checks as you work.

Flag only issues that:
- were introduced or made worse by the diff;
- have concrete, provable impact on correctness, performance, security, or
  maintainability; and
- are discrete, actionable, and likely worth fixing.

Do not speculate or combine unrelated issues in one finding.

### Priority

- **[P0]** — Blocking for all users, independent of input assumptions.
- **[P1]** — Urgent; fix in the next cycle.
- **[P2]** — Normal priority.
- **[P3]** — Minor improvement.

For each finding, cite the changed file and line, explain the impact and when it
occurs, and recommend a fix. Use one brief paragraph, keep snippets under three
lines, and omit praise or filler.

### High-signal checks

For code handling untrusted input, check for open redirects, unparameterized
SQL, SSRF through user-supplied URLs, and sanitization where output escaping is
required.

Inspect every changed \`try/catch\`. Flag silent parsing, IO, or network
fallbacks—and catches added only for lint—unless recovery is justified at that
layer. Prefer fail-fast behavior over silent degradation.

---

## Review Dimensions

Check every dimension, but report only concrete findings:

- **Design:** fit, modularity, coupling, and API boundaries.
- **Performance:** hot-path blocking, N+1 work, complexity, and waste.
- **Security:** injection, auth/authz, secrets, exposure, and input validation.
- **Effectiveness:** unnecessary complexity, dead code, and simpler alternatives.
- **Correctness:** edge cases, races, nullability, assumptions, and type safety.
- **Code Quality:** readability, consistency, duplication, and test coverage.

## Output Format

Use line-oriented markdown that copies cleanly into ADO PR comments. Do not use
tables.

**Summary** — One short paragraph covering the change, overall risk, and any
important caveats.

**Verdict** — \`correct\` (no P0/P1 findings) or \`needs attention\` (has P0/P1
findings).

**Findings** — one block per finding, most severe first. Replace placeholders in
braces; priority must be P0, P1, P2, or P3:

### [{priority}] \`{path/to/file}\`:{line} — {concise issue title}

{One brief paragraph describing the impact, triggering conditions, and fix.}

If there are no findings, write: *(none)*

**Human Reviewer Callouts (Non-Blocking)** — include only applicable items.
Do not repeat a callout as a finding unless it is independently defective.

- **Adds a database migration:** <files/details>
- **Adds a new dependency:** <package(s)/details>
- **Changes a dependency or lockfile:** <files/package(s)/details>
- **Modifies auth/permissions:** <what changed and where>
- **Breaks a public schema/API/contract:** <what changed and where>
- **Includes irreversible or destructive operations:** <operation and scope>

If none apply, write: *(none)*`;

function notifyError(ctx: ExtensionContext, message: string): void {
  ctx.ui.notify(message, "error");
}

export default function (pi: ExtensionAPI) {
  async function git(args: string[], ctx: ExtensionContext): Promise<string> {
    const result = await pi.exec("git", args, { cwd: ctx.cwd, timeout: 10000 });
    if (result.code !== 0) {
      throw new Error(result.stderr?.trim() || `git ${args.join(" ")} exited with code ${result.code}`);
    }
    return (result.stdout ?? "").trim();
  }

  async function gitOk(args: string[], ctx: ExtensionContext): Promise<boolean> {
    const result = await pi.exec("git", args, { cwd: ctx.cwd, timeout: 10000 });
    return result.code === 0;
  }

  async function resolveBaseBranch(baseBranch: string, ctx: ExtensionContext): Promise<string | null> {
    for (const ref of [baseBranch, `origin/${baseBranch}`]) {
      if (await gitOk(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], ctx)) return ref;
    }
    return null;
  }

  async function runReviewSummary(baseBranch: string, action: "requested" | "completed" | "reset", ctx: ExtensionContext): Promise<void> {
    if (!ctx.isIdle()) throw new Error("Wait for the current turn to finish before changing review checkpoints.");
    const sessionId = ctx.sessionManager.getSessionId();
    const leafId = ctx.sessionManager.getLeafId();
    const assertSession = () => {
      if (ctx.sessionManager.getSessionId() !== sessionId || ctx.sessionManager.getLeafId() !== leafId)
        throw new Error("Session branch changed during review setup; rerun the command.");
    };
    if (!(await gitOk(["rev-parse", "--git-dir"], ctx))) {
      notifyError(ctx, "Not in a git repository");
      return;
    }

    let currentBranch: string;
    try {
      currentBranch = await git(["rev-parse", "--abbrev-ref", "HEAD"], ctx);
    } catch {
      notifyError(ctx, "Failed to determine current branch");
      return;
    }

    if (currentBranch === "HEAD") {
      notifyError(ctx, "You are in detached HEAD state. Checkout a branch first.");
      return;
    }

    const resolvedBase = await resolveBaseBranch(baseBranch, ctx);
    if (!resolvedBase) {
      notifyError(
        ctx,
        `Base branch "${baseBranch}" not found (tried local and origin/${baseBranch}). Make sure you've run \`git fetch origin\` first.`,
      );
      return;
    }

    if (currentBranch === resolvedBase) {
      notifyError(ctx, `You are on ${resolvedBase}. Checkout the feature branch to review.`);
      return;
    }

    const currentHead = await git(["rev-parse", "HEAD"], ctx);
    let mergeBase: string;
    try {
      mergeBase = await git(["merge-base", resolvedBase, currentHead], ctx);
    } catch {
      notifyError(ctx, `No common ancestor found between ${currentBranch} and ${resolvedBase}. Are they related?`);
      return;
    }

    const scope = {
      root: await realpath(await git(["rev-parse", "--show-toplevel"], ctx)),
      gitDir: await realpath(await git(["rev-parse", "--absolute-git-dir"], ctx)),
      branch: currentBranch, base: resolvedBase, mergeBase,
    };
    const assertStable = async () => {
      if (!ctx.isIdle() || await git(["rev-parse", "--abbrev-ref", "HEAD"], ctx) !== currentBranch ||
          await git(["rev-parse", "HEAD"], ctx) !== currentHead ||
          await git(["merge-base", resolvedBase, currentHead], ctx) !== mergeBase)
        throw new Error("Git/session state changed during review setup; rerun the command.");
      assertSession();
    };
    const entries = ctx.sessionManager.getBranch();
    const state = readReviewState(entries, scope);
    if (action === "reset") {
      await assertStable();
      pi.appendEntry<ReviewCheckpoint>(REVIEW_ENTRY, { version: 1, action, scope, head: currentHead, requestId: randomUUID() });
      ctx.ui.notify("Review checkpoint reset for this repository/branch/base scope.", "info");
      return;
    }
    if (action === "completed") {
      const pending = state.pending;
      if (!pending) {
        if (state.completed && await gitOk(["merge-base", "--is-ancestor", mergeBase, state.completed], ctx) &&
            await gitOk(["merge-base", "--is-ancestor", state.completed, currentHead], ctx)) {
          await assertStable();
          ctx.ui.notify(`Review already confirmed through ${state.completed.substring(0, 8)}. No pending review to complete.${state.completed !== currentHead ? ` Run /review-summary ${baseBranch} to review newer commits.` : ""}`, "info");
          return;
        }
        throw new Error("No pending review in this scope. Run /review-summary first.");
      }
      if (!hasFinishedResponse(entries, pending.index)) throw new Error("No successful final assistant response after the request; unfinished or failed reviews cannot be completed.");
      if (!(await gitOk(["merge-base", "--is-ancestor", pending.data.head, currentHead], ctx)))
        throw new Error("Requested HEAD is no longer an ancestor; rerun the review after the history rewrite.");
      await assertStable();
      pi.appendEntry<ReviewCheckpoint>(REVIEW_ENTRY, { ...pending.data, action });
      ctx.ui.notify(`Confirmed review through ${pending.data.head.substring(0, 8)} (not any newer commits).`, "info");
      return;
    }
    if (mergeBase === currentHead) {
      ctx.ui.notify(`No new commits on ${currentBranch} compared to ${resolvedBase}`, "info");
      return;
    }

    let reviewStart = mergeBase;
    let isIterative = false;

    if (state.completed && await gitOk(["merge-base", "--is-ancestor", mergeBase, state.completed], ctx) &&
        await gitOk(["merge-base", "--is-ancestor", state.completed, currentHead], ctx)) {
      reviewStart = state.completed;
      isIterative = true;
    }
    if (reviewStart === currentHead) {
      ctx.ui.notify("No new commits since the confirmed review. Use /review-summary reset [base] to review again.", "info");
      return;
    }

    // Gather lightweight context only. The model should inspect files and diffs
    // itself with tools so its reasoning stays visible in the conversation.
    const range = `${reviewStart}..${currentHead}`;
    const commitDetail = await git(["log", "--format=%h %an: %s", range], ctx);
    const commitCount = commitDetail ? commitDetail.split("\n").length : 0;
    const changedFiles = await git(["diff", "--name-status", range], ctx);
    const diffStat = await git(["diff", "--stat", range], ctx);

    const header = isIterative
      ? `🔄 **Updated review** — \`${currentBranch}\` → \`${resolvedBase}\`\n` +
        `**${commitCount} new commit(s)** since last review. ` +
        `First, verify whether your previous review comments were addressed. ` +
        `Flag any that were ignored or only partially fixed.`
      : `📋 **PR Review** — \`${currentBranch}\` → \`${resolvedBase}\`\n` +
        `Base: \`${resolvedBase}\` · Merge-base: \`${mergeBase.substring(0, 8)}\` · ` +
        `${commitCount} commit(s)`;

    const message = `${header}

Review the pinned range \`${range}\`, not a later moving HEAD.
After the final review, the user must run \`/review-summary complete ${baseBranch}\`
to confirm completion. This request alone does not advance the checkpoint.

## Commits
\`\`\`
${commitDetail || "(no commits)"}
\`\`\`

## Files Changed
\`\`\`
${changedFiles || "(no files)"}
\`\`\`

## Diff Scope
\`\`\`
${diffStat || "(no changes)"}
\`\`\`

---

${REVIEW_RUBRIC}`;

    await assertStable();
    pi.appendEntry<ReviewCheckpoint>(REVIEW_ENTRY, {
      version: 1, action: "requested", scope, head: currentHead, requestId: randomUUID(),
    });
    pi.sendUserMessage(message);
  }

  pi.registerCommand("review-summary", {
    description: "PR review summary with rubric and model-driven code inspection",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      if (parts[0] === "help") {
        ctx.ui.notify("/review-summary [base] | complete [base] | reset [base]. Only explicit completion after a successful final review advances the active branch's checkpoint.", "info");
        return;
      }
      const action = parts[0] === "complete" ? "completed" : parts[0] === "reset" ? "reset" : "requested";
      if (action !== "requested") parts.shift();
      const base = parts[0] || "main";
      try {
        if (parts.length > 1 || base.startsWith("-")) throw new Error("Expected one base branch/ref; see /review-summary help.");
        await runReviewSummary(base, action, ctx);
      } catch (error) {
        notifyError(ctx, error instanceof Error ? error.message : String(error));
      }
    },
  });
}

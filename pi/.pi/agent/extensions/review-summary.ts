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

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// Tracks the HEAD commit SHA from the last summary review in this pi session so
// repeated runs only show newly-added commits and ask pi to verify previous
// comments were addressed.
let lastReviewedSha: string | null = null;

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

type ExecResult = {
  code: number;
  stdout?: string | null;
  stderr?: string | null;
};

function notifyError(ctx: ExtensionContext, message: string): void {
  ctx.ui.notify(message, "error");
}

export default function (pi: ExtensionAPI) {
  async function git(args: string[]): Promise<string> {
    const result = await pi.exec("git", args) as ExecResult;
    if (result.code !== 0) {
      throw new Error(result.stderr?.trim() || `git ${args.join(" ")} exited with code ${result.code}`);
    }
    return (result.stdout ?? "").trim();
  }

  async function gitOk(args: string[]): Promise<boolean> {
    const result = await pi.exec("git", args) as ExecResult;
    return result.code === 0;
  }

  async function isGitRepo(): Promise<boolean> {
    return gitOk(["rev-parse", "--git-dir"]);
  }

  async function resolveBaseBranch(baseBranch: string): Promise<string | null> {
    if (await gitOk(["rev-parse", "--verify", baseBranch])) {
      return baseBranch;
    }

    const remote = `origin/${baseBranch}`;
    if (await gitOk(["rev-parse", "--verify", remote])) {
      return remote;
    }

    return null;
  }

  async function runReviewSummary(baseBranch: string, ctx: ExtensionContext): Promise<void> {
    if (!(await isGitRepo())) {
      notifyError(ctx, "Not in a git repository");
      return;
    }

    let currentBranch: string;
    try {
      currentBranch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
    } catch {
      notifyError(ctx, "Failed to determine current branch");
      return;
    }

    if (currentBranch === "HEAD") {
      notifyError(ctx, "You are in detached HEAD state. Checkout a branch first.");
      return;
    }

    const resolvedBase = await resolveBaseBranch(baseBranch);
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

    let mergeBase: string;
    try {
      mergeBase = await git(["merge-base", resolvedBase, "HEAD"]);
    } catch {
      notifyError(ctx, `No common ancestor found between ${currentBranch} and ${resolvedBase}. Are they related?`);
      return;
    }

    const currentHead = await git(["rev-parse", "HEAD"]);
    if (mergeBase === currentHead) {
      ctx.ui.notify(`No new commits on ${currentBranch} compared to ${resolvedBase}`, "info");
      return;
    }

    let reviewStart = mergeBase;
    let isIterative = false;

    if (lastReviewedSha) {
      if (await gitOk(["merge-base", "--is-ancestor", lastReviewedSha, "HEAD"])) {
        reviewStart = lastReviewedSha;
        isIterative = true;
      } else {
        lastReviewedSha = null;
      }
    }

    lastReviewedSha = currentHead;

    // Gather lightweight context only. The model should inspect files and diffs
    // itself with tools so its reasoning stays visible in the conversation.
    const commitDetail = await git(["log", "--format=%h %an: %s", `${reviewStart}..HEAD`]);
    const commitCount = commitDetail ? commitDetail.split("\n").length : 0;
    const changedFiles = await git(["diff", "--name-status", `${reviewStart}..HEAD`]);
    const diffStat = await git(["diff", "--stat", `${reviewStart}..HEAD`]);

    const header = isIterative
      ? `🔄 **Updated review** — \`${currentBranch}\` → \`${resolvedBase}\`\n` +
        `**${commitCount} new commit(s)** since last review. ` +
        `First, verify whether your previous review comments were addressed. ` +
        `Flag any that were ignored or only partially fixed.`
      : `📋 **PR Review** — \`${currentBranch}\` → \`${resolvedBase}\`\n` +
        `Base: \`${resolvedBase}\` · Merge-base: \`${mergeBase.substring(0, 8)}\` · ` +
        `${commitCount} commit(s)`;

    const message = `${header}

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

    pi.sendUserMessage(message);
  }

  pi.registerCommand("review-summary", {
    description: "PR review summary with rubric and model-driven code inspection",
    handler: async (args, ctx) => {
      await runReviewSummary(args.trim() || "main", ctx);
    },
  });
}

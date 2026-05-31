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
 * and returns a holistic summary, dimension scores, findings, and callouts.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// Tracks the HEAD commit SHA from the last summary review in this pi session so
// repeated runs only show newly-added commits and ask pi to verify previous
// comments were addressed.
let lastReviewedSha: string | null = null;

const REVIEW_RUBRIC = `## Review Guidelines

You are acting as a code reviewer for a proposed code change made by another
engineer. Work through this review **step by step, out loud**, using tools to
examine the code. Do NOT generate the full review in one shot — show your work.

### Determining what to flag

Flag issues that:
1. Meaningfully impact correctness, performance, security, or maintainability.
2. Are discrete and actionable (not multiple issues combined into one).
3. Were introduced in the changes being reviewed (not pre-existing issues unless
   the change makes them worse).
4. The author would likely fix if they knew about them.
5. Have provable impact — identify the specific parts affected, don't speculate.
6. Demand rigor consistent with the rest of the codebase.

### Priority levels

Tag each finding with a priority level:
- **[P0]** — Drop everything to fix. Blocking. Only for universal issues that
  don't depend on assumptions about inputs.
- **[P1]** — Urgent. Should be addressed in the next cycle.
- **[P2]** — Normal. To be fixed eventually.
- **[P3]** — Low. Nice to have.

### Comment guidelines

1. Be clear about *why* the issue is a problem, not just what it is.
2. Communicate severity appropriately — don't exaggerate.
3. Be brief — at most 1 paragraph per finding.
4. Keep code snippets under 3 lines when providing fix examples.
5. Explicitly state scenarios or environments where the issue arises.
6. Use a matter-of-fact tone — helpful reviewer, not accusatory.
7. Avoid flattery or unhelpful phrases like "Great job on...".

### Untrusted user input

When reviewing code that handles user input:
1. Flag open redirects — they must validate against trusted domains only.
2. Flag SQL that is not parameterized.
3. Flag HTTP fetches with user-supplied URLs that aren't protected against
   access to local resources (SSRF).
4. Prefer escaping over sanitizing where possible (e.g., HTML escaping).

### Error handling (fail-fast)

When reviewing added or modified error handling, default to fail-fast:
1. Evaluate every new or changed \`try/catch\`: identify what can fail and why
   local handling is correct at that exact layer.
2. Silent local error recovery (especially parsing, IO, or network fallbacks)
   is a high-signal review candidate unless there is explicit justification.
3. If a catch exists only to satisfy lint/style without real handling, flag it.
4. When uncertain, prefer crashing fast over silent degradation.

---

## Review Dimensions

Cover each dimension. Read relevant code and cite specific file paths and
line numbers in your findings.

- **Design & Architecture** — Patterns, modularity, API/interface design.
  Does this fit the existing codebase? Is there tight coupling? Would a
  different approach be simpler?
- **Performance** — N+1 queries, blocking operations on hot paths, algorithmic
  complexity, unnecessary allocations, missing caching, large dependencies for
  trivial functionality.
- **Security** — Injection risks (SQL, command, script), auth/authz gaps,
  sensitive data exposure (logs, errors, client-side), input validation,
  hardcoded secrets, SSRF, open redirects.
- **Effectiveness** — Does it solve the problem well? Simpler alternatives?
  Dead code or over-engineering? Missing error handling for expected failures?
- **Correctness** — Edge cases, race conditions, null/undefined safety,
  off-by-one errors, incorrect assumptions about data or state, type safety.
- **Code Quality** — Readability, naming, comments (explain WHY not WHAT),
  consistency, DRY, test coverage of edge cases.

## Output Format

Compile findings in this format for easy copy-paste into ADO PR comments:

**Holistic Summary** — 2-3 paragraph overall assessment.

**Verdict** — \`correct\` (no blocking issues) or \`needs attention\` (has P0/P1 issues).

**Dimension Scores** (1-5):

| Dimension | Score | Notes |
|-----------|-------|-------|
| Design | ?/5 | |
| Performance | ?/5 | |
| Security | ?/5 | |
| Effectiveness | ?/5 | |
| Correctness | ?/5 | |
| Code Quality | ?/5 | |

**Findings** — List each finding with its priority tag, file location, and
explanation. Keep line references short (avoid ranges over 5-10 lines). Only
flag code that overlaps with the actual diff — don't flag pre-existing code.

| Priority | File | Lines | Issue | Recommendation |
|----------|------|-------|-------|----------------|
| P0 | \`path/to/file\` | 42 | SQL injection: user input passed directly to query | Use parameterized query: \`db.query("SELECT ... WHERE id = ?", [input])\` |
| P1 | \`path/to/file\` | 15 | Missing null check on response from API call | Add guard: \`if (!response) throw new Error(...)\` |
| P2 | \`path/to/file\` | 78 | Duplicate logic also in … | Extract shared utility |
| P3 | \`path/to/file\` | 100 | Naming could be clearer | Consider renaming to … |

**Human Reviewer Callouts (Non-Blocking)** — Include only those that apply.
These are informational for the human reviewer, not fix items. Do not include
them in Findings unless there is an independent defect. These callouts alone
must not change the verdict.

- **This change adds a database migration:** <files/details>
- **This change introduces a new dependency:** <package(s)/details>
- **This change changes a dependency (or the lockfile):** <files/package(s)/details>
- **This change modifies auth/permission behavior:** <what changed and where>
- **This change introduces backwards-incompatible public schema/API/contract changes:** <what changed and where>
- **This change includes irreversible or destructive operations:** <operation and scope>

If none apply, write: *(none)*

**Security Deep-Dive** (if applicable) — Detailed analysis of any
security-sensitive code paths.`;

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

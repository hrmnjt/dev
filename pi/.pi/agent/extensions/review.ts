/**
 * Review - Step-by-step PR review for ADO feature branches
 *
 * Since ADO only works on VPN (where most things are blocked), pi is used
 * offline for PR reviews. After `git fetch origin` and checking out the
 * feature branch, run `/review [base-branch]` to start an interactive,
 * tool-driven review where the model works out loud — reading files,
 * analyzing code, and compiling findings step by step.
 *
 * Usage:
 *   /review              — compare against main (default)
 *   /review develop      — compare against develop
 *
 * The model will:
 *   1. Understand what the PR does from commit messages
 *   2. Read and analyze key files using the read tool
 *   3. Evaluate each dimension (design, security, perf, etc.)
 *   4. Compile findings into structured output for easy ADO copy-paste
 *
 * Iterative reviews: in the same session, subsequent /review runs only show
 * new commits and ask the model to verify previous comments were addressed.
 */

import { execSync } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ---------------------------------------------------------------------------
// Per-session state: tracks the HEAD commit SHA from the last review so
// iterative reviews only show new commits and remind the model to verify
// that previous comments were addressed.
// ---------------------------------------------------------------------------
let lastReviewedSha: string | null = null;

// ---------------------------------------------------------------------------
// Git helpers (run on the host, outside the Gondolin VM)
// ---------------------------------------------------------------------------

function git(command: string): string {
  try {
    return execSync(command, {
      encoding: "utf-8",
      timeout: 30_000,
      stdio: "pipe",
    }).trim();
  } catch (e: any) {
    const stderr = e.stderr?.trim() || e.message;
    throw new Error(stderr);
  }
}

function gitOk(command: string): boolean {
  try {
    execSync(command, { encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function isGitRepo(): boolean {
  return gitOk("git rev-parse --git-dir");
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  pi.registerCommand("review", {
    description:
      "Step-by-step PR review: model works out loud with tool calls",
    handler: async (args, ctx) => {
      const baseBranch = args.trim() || "main";

      // --- Validation -------------------------------------------------------

      if (!isGitRepo()) {
        ctx.ui.notify("Not in a git repository", "error");
        return;
      }

      let currentBranch: string;
      try {
        currentBranch = git("git rev-parse --abbrev-ref HEAD");
      } catch {
        ctx.ui.notify("Failed to determine current branch", "error");
        return;
      }

      if (currentBranch === "HEAD") {
        ctx.ui.notify(
          "You are in detached HEAD state. Checkout a branch first.",
          "error",
        );
        return;
      }

      // --- Resolve base branch (local first, then origin/<name>) ------------

      let resolvedBase = baseBranch;
      if (!gitOk(`git rev-parse --verify "${resolvedBase}"`)) {
        const remote = `origin/${baseBranch}`;
        if (gitOk(`git rev-parse --verify "${remote}"`)) {
          resolvedBase = remote;
        } else {
          ctx.ui.notify(
            `Base branch "${baseBranch}" not found (tried local and origin/${baseBranch}). ` +
              `Make sure you've run \`git fetch origin\` first.`,
            "error",
          );
          return;
        }
      }

      if (currentBranch === resolvedBase) {
        ctx.ui.notify(
          `You are on ${resolvedBase}. Checkout the feature branch to review.`,
          "error",
        );
        return;
      }

      // --- Find merge base --------------------------------------------------

      let mergeBase: string;
      try {
        mergeBase = git(`git merge-base "${resolvedBase}" HEAD`);
      } catch {
        ctx.ui.notify(
          `No common ancestor found between ${currentBranch} and ${resolvedBase}. ` +
            `Are they related?`,
          "error",
        );
        return;
      }

      const currentHead = git("git rev-parse HEAD");
      if (mergeBase === currentHead) {
        ctx.ui.notify(
          `No new commits on ${currentBranch} compared to ${resolvedBase}`,
          "info",
        );
        return;
      }

      // --- Determine commit range (handle iterative reviews) ----------------

      let reviewStart = mergeBase;
      let isIterative = false;

      if (lastReviewedSha) {
        if (
          gitOk(`git merge-base --is-ancestor "${lastReviewedSha}" HEAD`)
        ) {
          reviewStart = lastReviewedSha;
          isIterative = true;
        } else {
          lastReviewedSha = null;
        }
      }

      lastReviewedSha = currentHead;

      // --- Gather lightweight context (NOT the full diff) -------------------
      // The model will explore the diff itself using tools, working out loud.

      const commitLog = git(
        `git log --oneline --no-decorate "${reviewStart}..HEAD"`,
      );
      const commitCount = commitLog ? commitLog.split("\n").length : 0;

      // Detailed commit log for context (hash + author + subject)
      const commitDetail = git(
        `git log --format="%h %an: %s" "${reviewStart}..HEAD"`,
      );

      // List of changed files with status
      const changedFiles = git(
        `git diff --name-status "${reviewStart}..HEAD"`,
      );

      // Diff stat for scope
      const diffStat = git(
        `git diff --stat "${reviewStart}..HEAD"`,
      );

      // --- Build the review kickoff message ---------------------------------
      // Give the model context but NOT the full diff — it should explore
      // files itself using read/bash tools, making its process visible.

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

## Review Process

Work through this review **step by step, out loud**, using tools to examine the
code. Do NOT generate the full review in one shot — show your work.

### Step 1 — Understand the change
Read the commit messages above. Use \`git show --stat <commit>\` or
\`git diff ${resolvedBase}...HEAD -- <file>\` to explore. Start by
reading files that appear central to the change. Summarize what the PR
does in 2-3 sentences before proceeding.

### Step 2 — Analyze by dimension
Go through the files systematically. For each dimension below, read relevant
code and note findings. Call out specific file paths and line numbers.

- **Design & Architecture** — Patterns, modularity, API design. Does this fit
  the existing codebase or fight it?
- **Performance** — Bottlenecks, N+1 queries, blocking ops, algorithmic
  complexity, memory.
- **Security** — Injection risks, auth/authz gaps, sensitive data exposure,
  input validation.
- **Effectiveness** — Does it solve the problem well? Simpler alternatives?
  Dead code or over-engineering?
- **Correctness** — Edge cases, error handling, race conditions, null safety,
  off-by-one errors.
- **Code Quality** — Readability, naming, comments, consistency, DRY, test
  coverage.

### Step 3 — Compile findings
After analyzing, compile everything into this format (easy for me to copy-paste
into ADO PR comments):

**Holistic Summary** — 2-3 paragraph overall assessment.

**Dimension Scores** (1-5):

| Dimension | Score | Notes |
|-----------|-------|-------|
| Design | ?/5 | |
| Performance | ?/5 | |
| Security | ?/5 | |
| Effectiveness | ?/5 | |
| Correctness | ?/5 | |
| Code Quality | ?/5 | |

**Critical Findings** 🔴 — Must fix before merge:

| File | Lines | Issue | Fix |
|------|-------|-------|-----|
| \`path/to/file\` | 42-45 | ... | ... |

**Suggestions** 🟡 — Worth improving, not blocking:

| File | Lines | Issue | Suggestion |
|------|-------|-------|------------|
| \`path/to/file\` | 15 | ... | ... |

**Observations** 🟢 — Positive notes and minor observations:

| File | Lines | Note |
|------|-------|------|

**Security Deep-Dive** (if applicable)`;

      pi.sendUserMessage(message);
    },
  });
}

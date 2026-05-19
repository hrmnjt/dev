/**
 * Hunk - Feed repo-local Hunk review feedback back into pi.
 *
 * Simple workflow:
 *   1. Let pi make edits.
 *   2. In another host terminal, run `pihunk` (zsh helper) or `hunk diff`.
 *   3. Put review comments in `.hunk-feedback.md` at the repo root.
 *   4. Back in pi, run `/hunk`.
 *
 * The handoff is intentionally just a shared file in the repo. The repo is
 * mounted into Gondolin as /workspace, and this extension runs on the host, so
 * both sides can agree on repo-relative paths without terminal automation.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const FEEDBACK_FILE = ".hunk-feedback.md";
const GUEST_WORKSPACE = "/workspace";

function runText(command: string, args: string[], cwd: string): string | null {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function git(cwd: string, args: string[]): string {
  return runText("git", args, cwd) ?? "";
}

function isGitRepo(cwd: string): boolean {
  return runText("git", ["rev-parse", "--show-toplevel"], cwd) !== null;
}

function repoRoot(cwd: string): string {
  return git(cwd, ["rev-parse", "--show-toplevel"]) || cwd;
}

function ensureGitInfoExclude(root: string): void {
  const gitDir = runText("git", ["rev-parse", "--path-format=absolute", "--git-dir"], root);
  if (!gitDir) return;

  const excludePath = path.join(gitDir, "info", "exclude");
  fs.mkdirSync(path.dirname(excludePath), { recursive: true });

  let current = "";
  try {
    current = fs.readFileSync(excludePath, "utf8");
  } catch {
    // File does not exist yet.
  }

  const entries = new Set(current.split("\n").map((line) => line.trim()));
  const needed = [FEEDBACK_FILE];
  const missing = needed.filter((entry) => !entries.has(entry));
  if (missing.length === 0) return;

  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(excludePath, `${prefix}${missing.join("\n")}\n`, "utf8");
}

function resolveFeedbackPath(root: string, arg: string): string {
  const requested = arg.trim() || FEEDBACK_FILE;
  return path.isAbsolute(requested) ? requested : path.join(root, requested);
}

function relativeToRoot(root: string, filePath: string): string {
  const rel = path.relative(root, filePath);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : filePath;
}

function isOnlyTemplate(text: string): boolean {
  const stripped = text
    .replace(/# Hunk feedback for pi/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  return stripped.length === 0;
}

function buildContext(root: string, feedbackPath: string): string {
  const feedbackRel = relativeToRoot(root, feedbackPath);
  const feedbackGuest = path.posix.join(GUEST_WORKSPACE, feedbackRel.split(path.sep).join(path.posix.sep));

  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]) || "(unknown)";
  const head = git(root, ["rev-parse", "--short", "HEAD"]) || "(unknown)";
  const upstream = git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || "(none)";
  const status = git(root, ["status", "--short"]);
  const changedFiles = git(root, ["diff", "HEAD", "--name-status"]);
  const diffStat = git(root, ["diff", "HEAD", "--stat"]);
  const stagedFiles = git(root, ["diff", "--cached", "--name-status"]);
  const unstagedFiles = git(root, ["diff", "--name-status"]);
  const untrackedFiles = git(root, ["ls-files", "--others", "--exclude-standard"]);

  return `# Hunk Feedback Context

Generated: ${new Date().toISOString()}

## Paths

- Host repo: ${root}
- Gondolin repo: ${GUEST_WORKSPACE}
- Feedback file: ${feedbackRel}
- Feedback file in Gondolin: ${feedbackGuest}

## Git

- Branch: ${branch}
- HEAD: ${head}
- Upstream: ${upstream}

## Current status

~~~
${status || "(clean)"}
~~~

## Changed files vs HEAD

~~~
${changedFiles || "(none)"}
~~~

## Staged files

~~~
${stagedFiles || "(none)"}
~~~

## Unstaged files

~~~
${unstagedFiles || "(none)"}
~~~

## Untracked files

~~~
${untrackedFiles || "(none)"}
~~~

## Diff stat vs HEAD

~~~
${diffStat || "(none)"}
~~~
`;
}

function buildMessage(feedback: string, source: string, context: string): string {
  return `I reviewed your latest changes with Hunk and saved feedback in ${source}.

<review-context>
${context}
</review-context>

Please address every actionable comment. Rules:
- Treat paths as relative to the current repository. If a host absolute path appears, map it to the same file under /workspace.
- Use the review context for scope, but inspect files/diffs with tools before editing.
- Preserve unrelated changes.
- If a comment is unclear or impossible to fix, say so explicitly instead of guessing.
- After making fixes, summarize each comment and how it was addressed.

<review-comments>
${feedback}
</review-comments>`;
}

async function sendHunkFeedback(pi: ExtensionAPI, args: string, ctx: { ui: { notify: (message: string, kind?: string) => void } }) {
  const cwd = process.cwd();
  if (!isGitRepo(cwd)) {
    ctx.ui.notify("/hunk must be run from inside a git repository.", "error");
    return;
  }

  const root = repoRoot(cwd);
  ensureGitInfoExclude(root);

  const feedbackPath = resolveFeedbackPath(root, args);
  if (!fs.existsSync(feedbackPath)) {
    ctx.ui.notify(`No Hunk feedback file found: ${feedbackPath}`, "error");
    return;
  }

  const feedback = fs.readFileSync(feedbackPath, "utf8").trim();
  if (!feedback || isOnlyTemplate(feedback)) {
    ctx.ui.notify(`Hunk feedback file has no comments yet: ${feedbackPath}`, "error");
    return;
  }

  const source = relativeToRoot(root, feedbackPath);
  const context = buildContext(root, feedbackPath);
  pi.sendUserMessage(buildMessage(feedback, source, context));
  ctx.ui.notify(`Sent Hunk feedback from ${source} to pi.`, "info");
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("hunk", {
    description: "Read .hunk-feedback.md and send the review comments to pi with git context",
    handler: async (args, ctx) => {
      await sendHunkFeedback(pi, args, ctx);
    },
  });
}

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

export type ReviewTarget =
  | { kind: "head" }
  | { kind: "staged" }
  | { kind: "unstaged" }
  | { kind: "range"; range: string }
  | { kind: "base"; base: string };

export function diffArgs(target: ReviewTarget, extra: string[] = []): string[] {
  if ((target.kind === "range" && target.range.startsWith("-")) ||
      (target.kind === "base" && target.base.startsWith("-"))) {
    throw new Error("Review revisions must not start with '-'.");
  }
  const common = ["diff", "--no-color", "--no-ext-diff", "--find-renames", ...extra];
  switch (target.kind) {
    case "head": return [...common, "HEAD", "--"];
    case "staged": return [...common, "--cached", "--"];
    case "unstaged": return [...common, "--"];
    case "range": return [...common, target.range, "--"];
    case "base": return [...common, "--merge-base", target.base, "--"];
  }
}

// Unlike optional metadata probes, failed review commands must not look like
// an empty diff. No external diff command or pager is needed for collection.
export function reviewGit(root: string, args: string[], env: NodeJS.ProcessEnv): string {
  const result = spawnSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd: root, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.error?.message || result.stderr.trim() || `exit ${result.status}`}`);
  }
  return result.stdout.trimEnd();
}

export type ReviewIndex = { env: NodeJS.ProcessEnv; cleanup: () => void };

// Range/staged reviews do not need untracked files. Other targets use a private
// copy of the selected index, including a linked worktree's own index.
export function createReviewIndex(root: string, target: ReviewTarget, baseEnv: NodeJS.ProcessEnv = process.env): ReviewIndex {
  if (target.kind === "staged" || target.kind === "range") {
    return { env: { ...baseEnv, GIT_OPTIONAL_LOCKS: "0" }, cleanup: () => {} };
  }

  const tempDir = mkdtempSync(join(tmpdir(), "pi-review-index-"));
  const cleanup = () => rmSync(tempDir, { recursive: true, force: true });
  try {
    const indexPath = join(tempDir, "index");
    const realIndex = reviewGit(root, ["rev-parse", "--path-format=absolute", "--git-path", "index"], baseEnv);
    if (existsSync(realIndex)) copyFileSync(realIndex, indexPath);
    const env = { ...baseEnv, GIT_INDEX_FILE: indexPath, GIT_OPTIONAL_LOCKS: "0" };
    // Do not initialize an existing missing index by staging tracked files.
    // This preserves intentional index deletions while exposing new files.
    const deleted = new Set(reviewGit(root, ["diff", "--cached", "--diff-filter=D", "--name-only", "-z"], env).split("\0"));
    const privatePath = relative(realpathSync(root), realpathSync(tempDir)).split(sep).join("/");
    const untracked = reviewGit(root, ["ls-files", "--others", "--exclude-standard", "-z"], env)
      .split("\0").filter((path) => path && !deleted.has(path) && !path.startsWith(`${privatePath}/`));
    if (untracked.length) {
      const result = spawnSync("git", ["--literal-pathspecs", "add", "-N", "--pathspec-from-file=-", "--pathspec-file-nul"], {
        cwd: root, env, input: `${untracked.join("\0")}\0`, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      });
      if (result.error || result.status !== 0) {
        throw new Error(`Could not prepare review index: ${result.error?.message || result.stderr.trim() || `exit ${result.status}`}`);
      }
    }
    return { env, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

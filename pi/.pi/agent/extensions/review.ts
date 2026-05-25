/**
 * Terminal-native review UI for pi.
 *
 * Usage:
 *   /review             Review working tree changes vs HEAD
 *   /review staged      Review staged changes
 *   /review unstaged    Review unstaged changes
 *   /review main..HEAD  Review a commit/range
 *   /review --base main Review changes against a base branch
 */

import { spawnSync } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  type Component,
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  truncateToWidth,
  type TUI,
  visibleWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

type ReviewTarget =
  | { kind: "head" }
  | { kind: "staged" }
  | { kind: "unstaged" }
  | { kind: "range"; range: string }
  | { kind: "base"; base: string };

type FileStatus = "added" | "modified" | "deleted" | "renamed" | "binary" | "unknown";

type DiffFile = {
  oldPath: string | null;
  newPath: string | null;
  displayPath: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  rawHeader: string[];
  binary?: boolean;
};

type DiffHunk = {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  section: string;
  lines: DiffLine[];
};

type DiffLine = {
  kind: "context" | "add" | "del" | "meta";
  oldLine?: number;
  newLine?: number;
  text: string;
};

type ReviewComment = {
  id: string;
  filePath: string;
  hunkIndex?: number;
  oldLine?: number;
  newLine?: number;
  body: string;
};

type ReviewResult = {
  target: ReviewTarget;
  comments: ReviewComment[];
};

type GitContext = {
  root: string;
  branch: string;
  head: string;
  upstream: string;
  status: string;
  diffStat: string;
};

type FocusPane = "files" | "diff" | "comments";
type Mode = "navigate" | "edit-comment" | "confirm-submit" | "help" | "confirm-cancel";

const GUEST_WORKSPACE = "/workspace";

function runText(command: string, args: string[], cwd: string): string | null {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return null;
  return result.stdout.trimEnd();
}

function git(cwd: string, args: string[]): string {
  return runText("git", ["-c", "core.quotePath=false", ...args], cwd) ?? "";
}

function isGitRepo(cwd: string): boolean {
  return runText("git", ["rev-parse", "--show-toplevel"], cwd) !== null;
}

function repoRoot(cwd: string): string {
  return git(cwd, ["rev-parse", "--show-toplevel"]) || cwd;
}

function parseTarget(args: string): ReviewTarget {
  const trimmed = args.trim();
  if (!trimmed || trimmed === "HEAD") return { kind: "head" };
  if (trimmed === "staged" || trimmed === "--staged") return { kind: "staged" };
  if (trimmed === "unstaged" || trimmed === "--unstaged") return { kind: "unstaged" };
  if (trimmed.startsWith("--base ")) return { kind: "base", base: trimmed.slice("--base ".length).trim() || "main" };
  return { kind: "range", range: trimmed };
}

function targetLabel(target: ReviewTarget): string {
  switch (target.kind) {
    case "head": return "HEAD";
    case "staged": return "staged";
    case "unstaged": return "unstaged";
    case "range": return target.range;
    case "base": return `${target.base}...working-tree`;
  }
}

function diffArgs(target: ReviewTarget, extra: string[] = []): string[] {
  const common = ["diff", "--find-renames", ...extra];
  switch (target.kind) {
    case "head": return [...common, "HEAD"];
    case "staged": return [...common, "--cached"];
    case "unstaged": return common;
    case "range": return [...common, target.range];
    case "base": return [...common, target.base];
  }
}

function hunkFirstLine(hunk: DiffHunk): { oldLine?: number; newLine?: number } {
  for (const line of hunk.lines) {
    if (line.kind !== "meta") {
      return { oldLine: line.oldLine, newLine: line.newLine };
    }
  }
  return { oldLine: hunk.oldStart, newLine: hunk.newStart };
}

function parseNumstat(text: string): Map<string, { additions: number; deletions: number }> {
  const out = new Map<string, { additions: number; deletions: number }>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const additions = parts[0] === "-" ? 0 : Number.parseInt(parts[0] || "0", 10) || 0;
    const deletions = parts[1] === "-" ? 0 : Number.parseInt(parts[1] || "0", 10) || 0;
    const path = parts.slice(2).join("\t");
    out.set(path, { additions, deletions });
  }
  return out;
}

function parseNameStatus(text: string): Map<string, FileStatus> {
  const out = new Map<string, FileStatus>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const code = parts[0] || "";
    const status = code.startsWith("A") ? "added"
      : code.startsWith("D") ? "deleted"
      : code.startsWith("R") ? "renamed"
      : code.startsWith("M") ? "modified"
      : "unknown";
    const path = status === "renamed" ? (parts[2] || parts[1] || "") : (parts[1] || "");
    if (path) out.set(path, status);
  }
  return out;
}

function stripPrefix(p: string): string | null {
  if (p === "/dev/null") return null;
  return p.replace(/^[ab]\//, "");
}

function parseDiff(raw: string, numstat: Map<string, { additions: number; deletions: number }>, statuses: Map<string, FileStatus>): DiffFile[] {
  if (raw.trim().length === 0) return [];
  const files: DiffFile[] = [];
  const lines = raw.split("\n");
  let current: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  const finishFile = () => {
    if (current) files.push(current);
    current = null;
    currentHunk = null;
  };

  const ensureCurrent = () => {
    if (!current) {
      current = {
        oldPath: null,
        newPath: null,
        displayPath: "(unknown)",
        status: "unknown",
        additions: 0,
        deletions: 0,
        hunks: [],
        rawHeader: [],
      };
    }
    return current;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      finishFile();
      const match = line.match(/^diff --git a\/(.*) b\/(.*)$/);
      const oldPath = match?.[1] ?? null;
      const newPath = match?.[2] ?? oldPath;
      const displayPath = newPath || oldPath || "(unknown)";
      const stats = numstat.get(displayPath) || numstat.get(oldPath || "") || { additions: 0, deletions: 0 };
      current = {
        oldPath,
        newPath,
        displayPath,
        status: statuses.get(displayPath) || statuses.get(oldPath || "") || "modified",
        additions: stats.additions,
        deletions: stats.deletions,
        hunks: [],
        rawHeader: [line],
      };
      continue;
    }

    const file = ensureCurrent();

    if (line.startsWith("--- ")) {
      file.oldPath = stripPrefix(line.slice(4).trim());
      file.rawHeader.push(line);
      continue;
    }
    if (line.startsWith("+++ ")) {
      file.newPath = stripPrefix(line.slice(4).trim());
      file.displayPath = file.newPath || file.oldPath || file.displayPath;
      const stats = numstat.get(file.displayPath) || { additions: file.additions, deletions: file.deletions };
      file.additions = stats.additions;
      file.deletions = stats.deletions;
      file.status = statuses.get(file.displayPath) || file.status;
      file.rawHeader.push(line);
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hunkMatch) {
      oldLine = Number.parseInt(hunkMatch[1]!, 10);
      newLine = Number.parseInt(hunkMatch[3]!, 10);
      currentHunk = {
        header: line,
        oldStart: oldLine,
        oldLines: Number.parseInt(hunkMatch[2] || "1", 10),
        newStart: newLine,
        newLines: Number.parseInt(hunkMatch[4] || "1", 10),
        section: (hunkMatch[5] || "").trim(),
        lines: [],
      };
      file.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) {
      file.rawHeader.push(line);
      if (line.includes("Binary files") || line.includes("GIT binary patch")) {
        file.binary = true;
        file.status = "binary";
      }
      continue;
    }

    if (line.startsWith("+")) {
      currentHunk.lines.push({ kind: "add", newLine, text: line.slice(1) });
      newLine++;
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({ kind: "del", oldLine, text: line.slice(1) });
      oldLine++;
    } else if (line.startsWith("\\")) {
      currentHunk.lines.push({ kind: "meta", text: line });
    } else {
      const text = line.startsWith(" ") ? line.slice(1) : line;
      currentHunk.lines.push({ kind: "context", oldLine, newLine, text });
      oldLine++;
      newLine++;
    }
  }
  finishFile();
  return files.filter((f) => f.displayPath !== "(unknown)" || f.hunks.length > 0 || f.rawHeader.length > 0);
}

function collectReview(root: string, target: ReviewTarget): { files: DiffFile[]; context: GitContext; rawDiff: string } {
  if (target.kind !== "staged") {
    spawnSync("git", ["add", "-N", "."], { cwd: root, stdio: "ignore" });
  }

  const context: GitContext = {
    root,
    branch: git(root, ["rev-parse", "--abbrev-ref", "HEAD"]) || "(unknown)",
    head: git(root, ["rev-parse", "--short", "HEAD"]) || "(unknown)",
    upstream: git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || "(none)",
    status: git(root, ["status", "--short"]),
    diffStat: git(root, diffArgs(target, ["--stat"])),
  };

  const rawDiff = git(root, diffArgs(target, ["--unified=80"]));
  const numstat = parseNumstat(git(root, diffArgs(target, ["--numstat"])));
  const statuses = parseNameStatus(git(root, diffArgs(target, ["--name-status"])));
  return { files: parseDiff(rawDiff, numstat, statuses), context, rawDiff };
}

function buildReviewMessage(result: ReviewResult, context: GitContext): string {
  const comments = result.comments.map((comment, index) => {
    const loc = [comment.filePath];
    if (comment.hunkIndex !== undefined) loc.push(`hunk ${comment.hunkIndex + 1}`);
    if (comment.newLine !== undefined) loc.push(`new line ${comment.newLine}`);
    else if (comment.oldLine !== undefined) loc.push(`old line ${comment.oldLine}`);
    return `${index + 1}. ${loc.join(", ")}\n   ${comment.body.trim().replace(/\n/g, "\n   ")}`;
  }).join("\n\n");

  return `I reviewed the current changes in pi's terminal review UI.

<review-context>
Generated: ${new Date().toISOString()}
Repo: ${GUEST_WORKSPACE}
Branch: ${context.branch}
HEAD: ${context.head}
Upstream: ${context.upstream}
Target: ${targetLabel(result.target)}

Status:
~~~
${context.status || "(clean)"}
~~~

Diff stat:
~~~
${context.diffStat || "(none)"}
~~~
</review-context>

Please address every actionable review comment. Rules:
- Treat paths as relative to the current repository under /workspace.
- Inspect the relevant files/diffs before editing.
- Preserve unrelated changes.
- If a comment is unclear or impossible to fix, say so explicitly.
- After making fixes, summarize each comment and how it was addressed.

<review-comments>
${comments || "(none)"}
</review-comments>`;
}

class ReviewComponent implements Component {
  private files: DiffFile[];
  private target: ReviewTarget;
  private tui: TUI;
  private done: (result: ReviewResult | null) => void;
  private comments: ReviewComment[] = [];
  private selectedFileIndex = 0;
  private selectedHunkIndex = 0;
  private diffScrollOffset = 0;
  private fileScrollOffset = 0;
  private focusPane: FocusPane = "files";
  private mode: Mode = "navigate";
  private editor: Editor;
  private pendingKey = "";
  private editingCommentId: string | null = null;
  private cachedWidth?: number;
  private cachedHeight?: number;
  private cachedLines?: string[];

  private dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  private bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  private cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  private green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  private red = (s: string) => `\x1b[31m${s}\x1b[0m`;
  private yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
  private gray = (s: string) => `\x1b[90m${s}\x1b[0m`;
  private inverse = (s: string) => `\x1b[7m${s}\x1b[0m`;

  constructor(files: DiffFile[], target: ReviewTarget, tui: TUI, done: (result: ReviewResult | null) => void) {
    this.files = files;
    this.target = target;
    this.tui = tui;
    this.done = done;

    const editorTheme: EditorTheme = {
      borderColor: this.dim,
      selectList: {
        selectedBg: this.inverse,
        matchHighlight: this.cyan,
        itemSecondary: this.gray,
      },
    };
    this.editor = new Editor(tui, editorTheme);
    this.editor.disableSubmit = true;
    this.editor.onChange = () => {
      this.saveEditingComment(false);
      this.invalidate();
      this.tui.requestRender();
    };
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedHeight = undefined;
    this.cachedLines = undefined;
  }

  private currentFile(): DiffFile | undefined {
    return this.files[this.selectedFileIndex];
  }

  private currentHunk(): DiffHunk | undefined {
    return this.currentFile()?.hunks[this.selectedHunkIndex];
  }

  private clampSelection(): void {
    if (this.files.length === 0) {
      this.selectedFileIndex = 0;
      this.selectedHunkIndex = 0;
      return;
    }
    this.selectedFileIndex = Math.max(0, Math.min(this.files.length - 1, this.selectedFileIndex));
    const hunkCount = this.currentFile()?.hunks.length || 0;
    this.selectedHunkIndex = Math.max(0, Math.min(Math.max(0, hunkCount - 1), this.selectedHunkIndex));
  }

  private commentsFor(filePath: string, hunkIndex?: number): ReviewComment[] {
    return this.comments.filter((c) => c.filePath === filePath && (hunkIndex === undefined || c.hunkIndex === hunkIndex));
  }

  private commentForCurrentHunk(): ReviewComment | undefined {
    const file = this.currentFile();
    if (!file) return undefined;
    const hunk = this.currentHunk();
    return this.comments.find((c) => c.filePath === file.displayPath && c.hunkIndex === (hunk ? this.selectedHunkIndex : undefined));
  }

  private moveFile(delta: number): void {
    this.selectedFileIndex += delta;
    this.selectedHunkIndex = 0;
    this.diffScrollOffset = 0;
    this.clampSelection();
    this.invalidate();
  }

  private moveHunk(delta: number): void {
    const file = this.currentFile();
    if (!file || file.hunks.length === 0) return;
    this.selectedHunkIndex += delta;
    this.diffScrollOffset = 0;
    this.clampSelection();
    this.invalidate();
  }

  private startComment(): void {
    const file = this.currentFile();
    if (!file) return;
    const hunk = this.currentHunk();
    const existing = this.commentForCurrentHunk();
    const id = existing?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (!existing) {
      const first = hunk ? hunkFirstLine(hunk) : {};
      this.comments.push({
        id,
        filePath: file.displayPath,
        hunkIndex: hunk ? this.selectedHunkIndex : undefined,
        oldLine: first.oldLine,
        newLine: first.newLine,
        body: "",
      });
    }
    this.editingCommentId = id;
    this.editor.setText(existing?.body || "");
    this.mode = "edit-comment";
    this.focusPane = "comments";
    this.invalidate();
  }

  private saveEditingComment(removeEmpty: boolean): void {
    if (!this.editingCommentId) return;
    const idx = this.comments.findIndex((c) => c.id === this.editingCommentId);
    if (idx < 0) return;
    const body = this.editor.getText();
    if (removeEmpty && body.trim() === "") {
      this.comments.splice(idx, 1);
    } else {
      this.comments[idx] = { ...this.comments[idx]!, body };
    }
  }

  private exitCommentEditor(): void {
    this.saveEditingComment(true);
    this.editingCommentId = null;
    this.mode = "navigate";
    this.focusPane = "diff";
    this.invalidate();
  }

  private deleteCurrentComment(): void {
    const existing = this.commentForCurrentHunk();
    if (!existing) return;
    this.comments = this.comments.filter((c) => c.id !== existing.id);
    this.invalidate();
  }

  private submit(): void {
    const actionable = this.comments.filter((c) => c.body.trim().length > 0);
    this.done({ target: this.target, comments: actionable });
  }

  private requestCancel(): void {
    if (this.comments.some((c) => c.body.trim().length > 0)) {
      this.mode = "confirm-cancel";
      this.invalidate();
    } else {
      this.done(null);
    }
  }

  handleInput(data: string): void {
    if (this.mode === "edit-comment") {
      if (matchesKey(data, Key.escape)) {
        this.exitCommentEditor();
        this.tui.requestRender();
        return;
      }
      this.editor.handleInput(data);
      this.saveEditingComment(false);
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (this.mode === "confirm-submit") {
      if (matchesKey(data, Key.enter) || data === "y" || data === "Y") {
        this.submit();
        return;
      }
      if (matchesKey(data, Key.escape) || data === "n" || data === "N" || data === "q") {
        this.mode = "navigate";
        this.invalidate();
        this.tui.requestRender();
        return;
      }
      return;
    }

    if (this.mode === "confirm-cancel") {
      if (matchesKey(data, Key.enter) || data === "y" || data === "Y") {
        this.done(null);
        return;
      }
      if (matchesKey(data, Key.escape) || data === "n" || data === "N") {
        this.mode = "navigate";
        this.invalidate();
        this.tui.requestRender();
        return;
      }
      return;
    }

    if (this.mode === "help") {
      if (matchesKey(data, Key.escape) || data === "?" || data === "q") {
        this.mode = "navigate";
        this.invalidate();
        this.tui.requestRender();
      }
      return;
    }

    // Pending Vim chords.
    if (this.pendingKey === "g") {
      this.pendingKey = "";
      if (data === "g") {
        if (this.focusPane === "files") this.selectedFileIndex = 0;
        this.diffScrollOffset = 0;
        this.clampSelection();
        this.invalidate();
        this.tui.requestRender();
        return;
      }
    }
    if (this.pendingKey === "d") {
      this.pendingKey = "";
      if (data === "d") {
        this.deleteCurrentComment();
        this.tui.requestRender();
        return;
      }
    }

    if (data === "g") { this.pendingKey = "g"; return; }
    if (data === "d") { this.pendingKey = "d"; return; }

    if (data === "q") { this.requestCancel(); this.tui.requestRender(); return; }
    if (matchesKey(data, Key.escape)) { this.requestCancel(); this.tui.requestRender(); return; }
    if (data === "?") { this.mode = "help"; this.invalidate(); this.tui.requestRender(); return; }
    if (matchesKey(data, Key.tab)) {
      this.focusPane = this.focusPane === "files" ? "diff" : this.focusPane === "diff" ? "comments" : "files";
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (data === "G") {
      if (this.focusPane === "files") this.selectedFileIndex = this.files.length - 1;
      else this.diffScrollOffset = 999999;
      this.clampSelection();
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (data === "j" || matchesKey(data, Key.down)) {
      if (this.focusPane === "files") this.moveFile(1);
      else this.diffScrollOffset++;
      this.tui.requestRender();
      return;
    }
    if (data === "k" || matchesKey(data, Key.up)) {
      if (this.focusPane === "files") this.moveFile(-1);
      else this.diffScrollOffset = Math.max(0, this.diffScrollOffset - 1);
      this.invalidate();
      this.tui.requestRender();
      return;
    }
    if (data === "h" || matchesKey(data, Key.left)) { this.moveFile(-1); this.tui.requestRender(); return; }
    if (data === "l" || matchesKey(data, Key.right) || matchesKey(data, Key.enter)) { this.moveFile(1); this.tui.requestRender(); return; }
    if (data === "n") { this.moveHunk(1); this.tui.requestRender(); return; }
    if (data === "N" || data === "p") { this.moveHunk(-1); this.tui.requestRender(); return; }
    if (matchesKey(data, Key.ctrl("u"))) { this.diffScrollOffset = Math.max(0, this.diffScrollOffset - 10); this.invalidate(); this.tui.requestRender(); return; }
    if (matchesKey(data, Key.ctrl("d"))) { this.diffScrollOffset += 10; this.invalidate(); this.tui.requestRender(); return; }
    if (data === "c") { this.startComment(); this.tui.requestRender(); return; }
    if (data === "s") { this.mode = "confirm-submit"; this.invalidate(); this.tui.requestRender(); return; }
  }

  render(width: number): string[] {
    const height = Math.max(12, this.tui.terminal.rows - 6);
    if (this.cachedLines && this.cachedWidth === width && this.cachedHeight === height) {
      return this.cachedLines;
    }

    let lines: string[];
    if (width >= 120) lines = this.renderWide(width, height);
    else lines = this.renderNarrow(width, height);

    this.cachedWidth = width;
    this.cachedHeight = height;
    this.cachedLines = lines;
    return lines;
  }

  private pad(line: string, width: number): string {
    const len = visibleWidth(line);
    if (len >= width) return truncateToWidth(line, width);
    return line + " ".repeat(width - len);
  }

  private border(width: number, left: string, fill: string, right: string): string {
    return this.dim(left + fill.repeat(Math.max(0, width - 2)) + right);
  }

  private statusLabel(status: FileStatus): string {
    const label = status === "added" ? "A" : status === "deleted" ? "D" : status === "renamed" ? "R" : status === "binary" ? "B" : "M";
    if (status === "added") return this.green(label);
    if (status === "deleted") return this.red(label);
    if (status === "renamed" || status === "binary") return this.yellow(label);
    return this.cyan(label);
  }

  private renderFileRows(width: number, height: number): string[] {
    const rows: string[] = [];
    const maxOffset = Math.max(0, this.files.length - height);
    this.fileScrollOffset = Math.max(0, Math.min(maxOffset, this.fileScrollOffset));
    if (this.selectedFileIndex < this.fileScrollOffset) this.fileScrollOffset = this.selectedFileIndex;
    if (this.selectedFileIndex >= this.fileScrollOffset + height) this.fileScrollOffset = this.selectedFileIndex - height + 1;

    for (let i = this.fileScrollOffset; i < Math.min(this.files.length, this.fileScrollOffset + height); i++) {
      const file = this.files[i]!;
      const count = this.commentsFor(file.displayPath).filter((c) => c.body.trim()).length;
      const selected = i === this.selectedFileIndex;
      const prefix = selected ? "›" : " ";
      const stat = `${file.additions > 0 ? `+${file.additions}` : "+0"} ${file.deletions > 0 ? `-${file.deletions}` : "-0"}`;
      const comment = count > 0 ? this.yellow(` ${count}c`) : "";
      let row = `${prefix} ${this.statusLabel(file.status)} ${file.displayPath}`;
      const statText = `${stat}${comment}`;
      const room = width - visibleWidth(statText) - 1;
      row = truncateToWidth(row, Math.max(1, room));
      row = this.pad(row, room) + " " + statText;
      rows.push(selected ? this.inverse(this.pad(row, width)) : this.pad(row, width));
    }
    while (rows.length < height) rows.push(" ".repeat(width));
    return rows;
  }

  private diffRows(width: number, height: number): string[] {
    const file = this.currentFile();
    const rows: string[] = [];
    if (!file) return Array.from({ length: height }, () => " ".repeat(width));

    const source: { text: string; hunkIndex?: number; isSelectedHunk?: boolean }[] = [];
    source.push({ text: this.bold(file.displayPath) + this.dim(`  ${file.additions}+ ${file.deletions}-`) });
    if (file.binary) source.push({ text: this.yellow("Binary file changed") });
    if (file.hunks.length === 0) {
      for (const header of file.rawHeader.slice(0, 20)) source.push({ text: this.gray(header) });
    }

    for (let h = 0; h < file.hunks.length; h++) {
      const hunk = file.hunks[h]!;
      const count = this.commentsFor(file.displayPath, h).filter((c) => c.body.trim()).length;
      const marker = count > 0 ? this.yellow(`  [${count} comment${count === 1 ? "" : "s"}]`) : "";
      source.push({ text: this.cyan(hunk.header) + marker, hunkIndex: h, isSelectedHunk: h === this.selectedHunkIndex });
      for (const line of hunk.lines) {
        const oldNo = line.oldLine === undefined ? "    " : String(line.oldLine).padStart(4);
        const newNo = line.newLine === undefined ? "    " : String(line.newLine).padStart(4);
        const prefix = line.kind === "add" ? "+" : line.kind === "del" ? "-" : line.kind === "meta" ? "\\" : " ";
        const raw = `${oldNo} ${newNo} ${prefix} ${line.text}`;
        const colored = line.kind === "add" ? this.green(raw)
          : line.kind === "del" ? this.red(raw)
          : line.kind === "meta" ? this.gray(raw)
          : raw;
        source.push({ text: colored, hunkIndex: h });
      }
    }

    const selectedHunkRow = source.findIndex((r) => r.isSelectedHunk);
    if (selectedHunkRow >= 0 && selectedHunkRow < this.diffScrollOffset) this.diffScrollOffset = selectedHunkRow;
    if (selectedHunkRow >= 0 && selectedHunkRow >= this.diffScrollOffset + height) this.diffScrollOffset = Math.max(0, selectedHunkRow - Math.floor(height / 3));
    const maxOffset = Math.max(0, source.length - height);
    this.diffScrollOffset = Math.max(0, Math.min(maxOffset, this.diffScrollOffset));

    for (let i = this.diffScrollOffset; i < Math.min(source.length, this.diffScrollOffset + height); i++) {
      const row = source[i]!;
      const padded = this.pad(row.text, width);
      rows.push(row.isSelectedHunk ? this.inverse(padded) : padded);
    }
    while (rows.length < height) rows.push(" ".repeat(width));
    return rows;
  }

  private commentRows(width: number, height: number): string[] {
    const rows: string[] = [];
    const file = this.currentFile();
    const hunk = this.currentHunk();
    const target = file ? `${file.displayPath}${hunk ? `, hunk ${this.selectedHunkIndex + 1}` : ""}` : "(none)";
    rows.push(this.pad(`${this.bold("Comment target:")} ${target}`, width));

    if (this.mode === "edit-comment") {
      const editorWidth = Math.max(10, width - 4);
      for (const line of this.editor.render(editorWidth).slice(0, height - 1)) {
        rows.push(this.pad("  " + line, width));
      }
    } else {
      const current = this.commentForCurrentHunk();
      if (current && current.body.trim()) {
        rows.push(this.pad(this.yellow("Current hunk comment:"), width));
        for (const wrapped of wrapTextWithAnsi(current.body.trim(), width - 2).slice(0, height - 2)) {
          rows.push(this.pad("  " + wrapped, width));
        }
      } else {
        rows.push(this.pad(this.dim("Press c to add a comment for this hunk."), width));
      }
    }
    while (rows.length < height) rows.push(" ".repeat(width));
    return rows.slice(0, height);
  }

  private renderWide(width: number, height: number): string[] {
    const lines: string[] = [];
    const fileWidth = Math.min(42, Math.max(28, Math.floor(width * 0.33)));
    const diffWidth = width - fileWidth - 3;
    const commentHeight = this.mode === "edit-comment" ? 7 : 5;
    const bodyHeight = Math.max(5, height - commentHeight - 5);

    const title = ` Review: ${targetLabel(this.target)} `;
    lines.push(this.border(width, "╭", "─", "╮"));
    lines.push(this.pad(this.dim("│") + this.bold(title) + this.dim(`Files: ${this.files.length}  Comments: ${this.comments.filter((c) => c.body.trim()).length}`), width - 1) + this.dim("│"));
    lines.push(this.dim("├") + this.dim("─".repeat(fileWidth)) + this.dim("┬") + this.dim("─".repeat(diffWidth)) + this.dim("┤"));

    const fileRows = this.renderFileRows(fileWidth, bodyHeight);
    const diffRows = this.diffRows(diffWidth, bodyHeight);
    for (let i = 0; i < bodyHeight; i++) {
      lines.push(this.dim("│") + fileRows[i] + this.dim("│") + diffRows[i] + this.dim("│"));
    }

    lines.push(this.dim("├") + this.dim("─".repeat(fileWidth)) + this.dim("┴") + this.dim("─".repeat(diffWidth)) + this.dim("┤"));
    for (const row of this.commentRows(width - 2, commentHeight)) {
      lines.push(this.dim("│") + row + this.dim("│"));
    }
    lines.push(this.dim("├") + this.dim("─".repeat(width - 2)) + this.dim("┤"));
    lines.push(this.dim("│") + this.footer(width - 2) + this.dim("│"));
    lines.push(this.border(width, "╰", "─", "╯"));

    return this.overlayIfNeeded(lines, width);
  }

  private renderNarrow(width: number, height: number): string[] {
    const lines: string[] = [];
    const bodyHeight = Math.max(5, height - 6);
    lines.push(this.border(width, "╭", "─", "╮"));
    const tabs = ["files", "diff", "comments"].map((p) => p === this.focusPane ? this.inverse(` ${p} `) : ` ${p} `).join(" ");
    lines.push(this.dim("│") + this.pad(tabs, width - 2) + this.dim("│"));
    lines.push(this.dim("├") + this.dim("─".repeat(width - 2)) + this.dim("┤"));
    const rows = this.focusPane === "files" ? this.renderFileRows(width - 2, bodyHeight)
      : this.focusPane === "comments" ? this.commentRows(width - 2, bodyHeight)
      : this.diffRows(width - 2, bodyHeight);
    for (const row of rows) lines.push(this.dim("│") + row + this.dim("│"));
    lines.push(this.dim("├") + this.dim("─".repeat(width - 2)) + this.dim("┤"));
    lines.push(this.dim("│") + this.footer(width - 2) + this.dim("│"));
    lines.push(this.border(width, "╰", "─", "╯"));
    return this.overlayIfNeeded(lines, width);
  }

  private footer(width: number): string {
    let text = this.mode === "edit-comment"
      ? "Esc save/exit comment · Enter newline"
      : width < 100
        ? "j/k move · n/N hunk · c comment · s submit · ? help · q quit"
        : "j/k files · h/l file · n/N hunk · c comment · dd delete · s submit · ? help · q quit";
    return this.pad(this.dim(truncateToWidth(text, width)), width);
  }

  private overlayIfNeeded(lines: string[], width: number): string[] {
    if (this.mode === "help") {
      return this.centerBox(lines, width, [
        this.bold("Review help"),
        "",
        "j/k or ↑/↓       move / scroll",
        "h/l or ←/→       previous/next file",
        "n / N            next/previous hunk",
        "c                comment current hunk",
        "dd               delete current hunk comment",
        "s                submit review",
        "gg / G           top / bottom",
        "Ctrl+u/Ctrl+d    half page up/down",
        "Tab              cycle pane",
        "q                quit",
        "",
        "Esc/?/q close help",
      ]);
    }
    if (this.mode === "confirm-submit") {
      const actionable = this.comments.filter((c) => c.body.trim());
      const content = [this.bold(`Submit ${actionable.length} comment${actionable.length === 1 ? "" : "s"}?`), ""];
      for (const [i, c] of actionable.entries()) {
        content.push(`${i + 1}. ${c.filePath}${c.hunkIndex !== undefined ? `, hunk ${c.hunkIndex + 1}` : ""}`);
        content.push(...wrapTextWithAnsi(`   ${c.body.trim()}`, Math.min(80, width - 12)).slice(0, 4));
        content.push("");
      }
      content.push("Enter/y submit · Esc/n return");
      return this.centerBox(lines, width, content.slice(0, Math.max(8, this.tui.terminal.rows - 10)));
    }
    if (this.mode === "confirm-cancel") {
      return this.centerBox(lines, width, [
        this.bold("Discard review comments?"),
        "",
        `${this.comments.filter((c) => c.body.trim()).length} comment(s) will be lost.`,
        "",
        "Enter/y discard · Esc/n return",
      ]);
    }
    return lines;
  }

  private centerBox(base: string[], width: number, content: string[]): string[] {
    const boxWidth = Math.min(width - 4, Math.max(50, Math.min(90, Math.max(...content.map((l) => visibleWidth(l)), 30) + 6)));
    const start = Math.max(1, Math.floor((base.length - content.length - 2) / 2));
    const leftPad = Math.max(0, Math.floor((width - boxWidth) / 2));
    const overlay: string[] = [];
    overlay.push(" ".repeat(leftPad) + this.dim("╭" + "─".repeat(boxWidth - 2) + "╮"));
    for (const line of content) {
      overlay.push(" ".repeat(leftPad) + this.dim("│") + this.pad("  " + line, boxWidth - 2) + this.dim("│"));
    }
    overlay.push(" ".repeat(leftPad) + this.dim("╰" + "─".repeat(boxWidth - 2) + "╯"));

    const out = [...base];
    for (let i = 0; i < overlay.length && start + i < out.length; i++) {
      out[start + i] = this.pad(overlay[i]!, width);
    }
    return out;
  }
}

async function review(pi: ExtensionAPI, args: string, ctx: ExtensionContext) {
  if (!ctx.hasUI) {
    ctx.ui.notify("/review requires interactive mode", "error");
    return;
  }

  const cwd = process.cwd();
  if (!isGitRepo(cwd)) {
    ctx.ui.notify("/review must be run from inside a git repository.", "error");
    return;
  }

  const root = repoRoot(cwd);
  const target = parseTarget(args);
  const { files, context } = collectReview(root, target);

  if (files.length === 0) {
    ctx.ui.notify(`No changes found for ${targetLabel(target)}.`, "info");
    return;
  }

  const result = await ctx.ui.custom<ReviewResult | null>((tui, _theme, _kb, done) => {
    return new ReviewComponent(files, target, tui, done);
  });

  if (result === null) {
    ctx.ui.notify("Review cancelled", "info");
    return;
  }

  if (result.comments.length === 0) {
    ctx.ui.notify("Review submitted with no comments; nothing sent.", "info");
    return;
  }

  pi.sendUserMessage(buildReviewMessage(result, context));
  ctx.ui.notify(`Sent ${result.comments.length} review comment(s) to pi.`, "info");
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("review", {
    description: "Review current git changes in a terminal UI and send comments to pi",
    handler: async (args, ctx) => {
      await review(pi, args, ctx);
    },
  });
}

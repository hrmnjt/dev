# Terminal-Native Code Review Extension Plan

## Goal

Build a pi extension that lets me review code changes **inside the current pi terminal session**.

The desired workflow is:

```text
pi generates or edits code
↓
I run /review
↓
pi opens an interactive terminal review UI
↓
I navigate files/hunks, write comments, and submit
↓
pi receives the review comments directly in the current conversation
↓
the assistant fixes the comments
```

No browser. No Hunk. No second terminal. No copy/paste feedback handoff.

---

## Why this is possible

pi extensions can render custom terminal UIs using `ctx.ui.custom(...)` and `@mariozechner/pi-tui`.

This repo already has a local example:

```text
pi/.pi/agent/extensions/answer.ts
```

It uses:

- `ctx.ui.custom(...)`
- `Component`
- `Editor`
- `Key` / `matchesKey`
- `wrapTextWithAnsi(...)`
- `visibleWidth(...)`
- `pi.sendUserMessage(...)`

`pi-doom` is an even stronger proof point:

```text
https://github.com/badlogic/pi-doom
```

It runs DOOM inside pi by rendering full terminal frames from a custom TUI component. A review UI is much simpler than DOOM: mostly text panes, colors, scrolling, and a multiline editor.

---

## User UX

### Start review

From the pi session:

```text
/review
```

Optional scopes:

```text
/review staged
/review unstaged
/review HEAD
/review main..HEAD
/review --base main
```

Default behavior should review all working tree changes against `HEAD`.

Before collecting the diff, the extension should run:

```bash
git add -N .
```

This makes untracked files appear in the diff without staging their contents.

---

## Review UI layout

### Wide terminal layout

For terminals roughly `>= 120` columns:

```text
╭─ Review: main..HEAD ───────────────────────────────────────────────────────╮
│ Branch: feature/foo   HEAD: abc1234   Files: 6   Comments: 3               │
├──────────────────────────────┬─────────────────────────────────────────────┤
│ Files                        │ Diff                                        │
│                              │                                             │
│ › M  src/app.ts        +8 -2 │ @@ -42,8 +42,12 @@ function run() {         │
│   A  src/review.ts    +90 -0 │   const value = load();                     │
│   M  README.md        +4 -1  │ - return oldThing(value);                   │
│   D  old.ts           +0 -12 │ + const result = newThing(value);           │
│                              │ + return result;                            │
│                              │   }                                         │
│                              │                                             │
│                              │ [comment: 1]                                │
├──────────────────────────────┴─────────────────────────────────────────────┤
│ Comment editor                                                             │
│ Current target: src/app.ts, hunk 2                                          │
│                                                                            │
│ > This changes behavior but there is no test coverage. Please add one.      │
├────────────────────────────────────────────────────────────────────────────┤
│ j/k files · h/l file · n/N hunk · c comment · dd delete · s submit · ? help · q quit │
╰────────────────────────────────────────────────────────────────────────────╯
```

### Narrow terminal layout

For narrower terminals, use tabs:

```text
╭─ Review: HEAD ─────────────────────────────╮
│ [Files] [Diff] [Comments] [Submit]         │
├────────────────────────────────────────────┤
│ › M  src/app.ts        +8 -2   1 comment   │
│   A  src/review.ts    +90 -0               │
│   M  README.md        +4 -1                │
├────────────────────────────────────────────┤
│ Tab switch pane · Enter select · q quit    │
╰────────────────────────────────────────────╯
```

Tabs:

```text
Files → Diff → Comments → Submit
```

---

## Review interaction model

### File navigation

The file list shows changed files with status and diff stats:

```text
M  src/app.ts                 +8  -2   1 comment
A  src/review.ts             +90  -0
D  src/old.ts                 +0 -12
R  src/old-name.ts → new.ts   +3  -3
```

Status colors:

| Status | Meaning | Color |
|--------|---------|-------|
| `A` | added | green |
| `M` | modified | blue/cyan |
| `D` | deleted | red |
| `R` | renamed | yellow |

### Diff navigation

The diff pane renders parsed unified diff hunks:

```text
@@ -42,8 +42,12 @@ function run() {
  context line
- removed line
+ added line
+ added line
  context line
```

Colors:

| Line type | Color |
|-----------|-------|
| hunk header | cyan/dim |
| context | normal/dim |
| addition | green |
| deletion | red |
| selected line/hunk | inverse or blue background |
| comment marker | yellow |

### Commenting

Phase 1 should support **hunk-level comments**.

Flow:

```text
1. Navigate to a file/hunk.
2. Press c.
3. Comment editor opens/focuses.
4. Type comment.
5. Press Esc to leave editor, or Ctrl+Enter/Enter depending editor behavior to save.
6. Comment marker appears beside that hunk.
```

Later phases can add line-level comments.

### Persistent shortcut reminder

The review UI should always show a one-line shortcut reminder at the bottom, similar to lazygit:

```text
j/k files · h/l file · n/N hunk · c comment · dd delete · s submit · ? help · q quit
```

In narrow terminals, shorten it but keep the essential actions visible:

```text
j/k move · n/N hunk · c comment · s submit · ? help · q quit
```

This footer should update by mode. For example, while editing a comment:

```text
Esc save/exit comment · Ctrl+C cancel · Enter newline
```

### Submit

Press `s` to preview comments:

```text
╭─ Submit review? ───────────────────────────────────────────────────────────╮
│ 3 comments                                                                 │
│                                                                            │
│ 1. src/app.ts, hunk 2                                                       │
│    This changes behavior but there is no test coverage. Please add one.    │
│                                                                            │
│ 2. src/review.ts, hunk 1                                                    │
│    This parser should handle binary files explicitly.                      │
│                                                                            │
│ Enter/y submit · Esc/n return to review                                    │
╰────────────────────────────────────────────────────────────────────────────╯
```

On confirm, the extension sends a user message into the active pi conversation.

---

## Keyboard controls

Use Vim-style bindings as the primary navigation model. Arrow keys can remain as aliases, but the UI should teach Vim keys first.

| Key | Action |
|-----|--------|
| `q` | quit/cancel review, with confirmation if comments exist |
| `Esc` | exit current mode/editor; cancel only from top-level navigation |
| `?` | show help overlay |
| `Tab` | cycle focused pane |
| `k` / `↑` | previous item / scroll up |
| `j` / `↓` | next item / scroll down |
| `h` / `←` | previous file / move to file pane |
| `l` / `→` | next file / move to diff pane |
| `gg` | first file or top of current list |
| `G` | last file or bottom of current list |
| `Ctrl+u` | half-page up in diff pane |
| `Ctrl+d` | half-page down in diff pane |
| `n` | next hunk |
| `N` / `p` | previous hunk |
| `c` | add/edit comment for current hunk |
| `dd` | delete selected/current comment |
| `s` | submit review |
| `Enter` | select / confirm depending mode |

When the comment editor is focused, normal text input should go to `Editor.handleInput(data)`. `Esc` exits editing mode.

---

## Message sent to pi

After submit, the extension should call `pi.sendUserMessage(...)` with a structured review message:

```text
I reviewed the current changes in pi's terminal review UI.

<review-context>
Generated: 2026-05-25T...
Repo: /workspace
Branch: feature/foo
HEAD: abc1234
Target: HEAD

Status:
 M src/app.ts
 A src/review.ts

Diff stat:
 src/app.ts     | 10 +++++++---
 src/review.ts  | 90 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
</review-context>

Please address every actionable review comment. Rules:
- Treat paths as relative to the current repository.
- Inspect the relevant files/diffs before editing.
- Preserve unrelated changes.
- If a comment is unclear or impossible to fix, say so explicitly.
- After making fixes, summarize each comment and how it was addressed.

<review-comments>
1. src/app.ts, hunk 2
   This changes behavior but there is no test coverage. Please add one.

2. src/review.ts, hunk 1
   This parser should handle binary files explicitly.
</review-comments>
```

This removes the current `.hunk-feedback.md` handoff from the primary workflow.

---

## Build plan

### File to add

```text
pi/.pi/agent/extensions/review.ts
```

Phase 1 can be a single file. If it grows, split later:

```text
pi/.pi/agent/extensions/review/parse-diff.ts
pi/.pi/agent/extensions/review/component.ts
pi/.pi/agent/extensions/review/message.ts
```

---

## Implementation architecture

```text
/review command
    │
    ▼
validate git repo
    │
    ▼
collect git metadata + raw diff
    │
    ▼
parse unified diff
    │
    ▼
open ReviewComponent with ctx.ui.custom(...)
    │
    ▼
user navigates/comments/submits
    │
    ▼
build review prompt
    │
    ▼
pi.sendUserMessage(...)
```

---

## Data collection

Use `child_process.spawnSync` from the extension, following the pattern already used in:

```text
pi/.pi/agent/extensions/hunk.ts
```

Commands:

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
git rev-parse --short HEAD
git rev-parse --abbrev-ref --symbolic-full-name @{u}
git status --short
git add -N .
git diff --find-renames --unified=80 HEAD
git diff --find-renames --name-status HEAD
git diff --stat HEAD
```

For alternate scopes:

```bash
# staged
git diff --cached --find-renames --unified=80

# unstaged
git diff --find-renames --unified=80

# range
git diff --find-renames --unified=80 main..HEAD
```

---

## Core data model

```ts
type ReviewTarget =
  | { kind: "head" }
  | { kind: "staged" }
  | { kind: "unstaged" }
  | { kind: "range"; range: string }
  | { kind: "base"; base: string };

type DiffFile = {
  oldPath: string | null;
  newPath: string | null;
  displayPath: string;
  status: "added" | "modified" | "deleted" | "renamed" | "binary";
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  rawHeader: string[];
};

type DiffHunk = {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
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
```

---

## TUI component design

Implement:

```ts
class ReviewComponent implements Component {
  handleInput(data: string): void;
  render(width: number): string[];
  invalidate(): void;
}
```

State:

```ts
type FocusPane = "files" | "diff" | "comments" | "submit";
type Mode = "navigate" | "edit-comment" | "confirm-submit" | "help";

class ReviewComponent {
  private files: DiffFile[];
  private comments: ReviewComment[];
  private selectedFileIndex: number;
  private selectedHunkIndex: number;
  private selectedLineIndex: number;
  private diffScrollOffset: number;
  private fileScrollOffset: number;
  private focusPane: FocusPane;
  private mode: Mode;
  private editor: Editor;
}
```

Rendering should be viewport-based. Do not render the entire diff for large changes; render only the visible lines for the current file/hunk/scroll offset.

---

## Parser requirements

The unified diff parser must handle:

- modified files
- added files
- deleted files
- renamed files
- file paths with spaces
- binary file markers
- empty files
- no newline at end of file markers
- diffs with zero hunks, e.g. mode-only changes

Hunk header pattern:

```regex
/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/
```

Line kinds:

```text
' ' context
'+' addition
'-' deletion
'\\' metadata, e.g. \ No newline at end of file
```

---

## Implementation phases

### Phase 1: Minimal useful reviewer

Deliver:

- `/review`
- git repo validation
- default `HEAD` scope
- `git add -N .`
- raw diff parsing
- file list
- hunk viewer
- hunk-level comments
- submit confirmation
- `pi.sendUserMessage(...)`

No new npm dependencies.

### Phase 2: Better navigation

Add:

- staged/unstaged/range scopes
- wide and narrow responsive layouts
- scrollable file list
- scrollable diff viewport
- help overlay
- comment count badges
- better cancellation/confirmation behavior

### Phase 3: Line-level comments

Add:

- selected diff line
- comments anchored to old/new line numbers
- visual marker beside commented lines
- output includes exact line references

### Phase 4: Polish

Add:

- optional syntax highlighting
- search within changed files
- collapse/expand hunks
- show full file path vs basename toggle
- persist draft comments if review is cancelled accidentally

---

## Expected challenges

### 1. Terminal layout complexity

The terminal width and height can vary. The component must render usable layouts for both wide and narrow terminals.

Mitigation:

- Start with a simple layout.
- Add responsive layout after core behavior works.
- Use `visibleWidth(...)` and `truncateToWidth(...)` to avoid broken borders.

### 2. Diff parser edge cases

Git diffs include renames, binary files, mode changes, file paths with spaces, and no-newline markers.

Mitigation:

- Keep raw headers in the model.
- Handle common cases first.
- Gracefully display unsupported files as metadata-only entries.

### 3. Large diffs

Rendering the whole diff every keypress can be slow and visually overwhelming.

Mitigation:

- Render only current file/hunk/viewport.
- Cache wrapped lines per file and width.
- Invalidate cache only when width or comments change.

### 4. Editor input conflicts

Navigation keys and text editing keys can conflict.

Mitigation:

- Use explicit modes: `navigate`, `edit-comment`, `confirm-submit`, `help`.
- When editing, send most input to `Editor.handleInput(data)`.
- `Esc` exits edit mode.

### 5. Host vs Gondolin paths

Tool calls run in the VM, but extensions run host-side. Paths may differ.

Mitigation:

- Use repo-relative paths everywhere in review comments.
- In the generated prompt, tell the model paths are relative to `/workspace`.
- Follow the current `hunk.ts` pattern for git context.

### 6. Untracked files

Untracked files do not appear in `git diff` by default.

Mitigation:

- Run `git add -N .` before diff collection.
- This makes files visible without staging contents.

### 7. User accidentally exits

The user might press `q`/`Esc` and lose draft comments.

Mitigation:

- Confirm if comments exist.
- Optional later: autosave drafts to `.pi-review-draft.json` in `.git/info` or temp dir.

---

## Non-goals for the first version

- Browser UI
- Hunk integration
- `@pierre/diffs` / `@pierre/trees` integration
- GitHub PR API integration
- Full syntax highlighting
- Multi-review persistence across pi sessions

These can be considered later, but the first version should prioritize the terminal-native review loop.

---

## Success criteria

The first version is successful if I can:

1. Ask pi to make changes.
2. Run `/review` in the same pi session.
3. See changed files and hunks in the terminal.
4. Add comments without leaving pi.
5. Submit the review.
6. Watch pi immediately start addressing the submitted comments.

The final UX should feel like a lightweight terminal PR review tool embedded directly inside pi.
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export const REVIEW_ENTRY = "hrmnjt.review-summary";
export interface ReviewScope {
  root: string;
  gitDir: string;
  branch: string;
  base: string;
  mergeBase: string;
}
export interface ReviewCheckpoint {
  version: 1;
  action: "requested" | "completed" | "reset";
  scope: ReviewScope;
  head: string;
  requestId: string;
}

const oid = (value: unknown): value is string => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
export const scopeKey = (scope: ReviewScope) => JSON.stringify([
  scope.root, scope.gitDir, scope.branch, scope.base, scope.mergeBase,
]);

function checkpoint(value: unknown): value is ReviewCheckpoint {
  if (!value || typeof value !== "object") return false;
  const c = value as ReviewCheckpoint;
  return c.version === 1 && ["requested", "completed", "reset"].includes(c.action) &&
    typeof c.requestId === "string" && c.requestId.length > 0 && oid(c.head) &&
    !!c.scope && typeof c.scope === "object" &&
    [c.scope.root, c.scope.gitDir, c.scope.branch, c.scope.base].every(s => typeof s === "string" && s.length > 0) && oid(c.scope.mergeBase);
}

// Re-read the active branch on every command: reload, fork, tree navigation and
// compaction need no process-global cache or scans of abandoned branches.
export function readReviewState(entries: readonly SessionEntry[], scope: ReviewScope) {
  let completed: string | undefined;
  let pending: { data: ReviewCheckpoint; index: number } | undefined;
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (entry.type !== "custom" || entry.customType !== REVIEW_ENTRY ||
        !checkpoint(entry.data) || scopeKey(entry.data.scope) !== scopeKey(scope)) continue;
    const data = entry.data;
    if (data.action === "reset") {
      completed = undefined;
      pending = undefined;
    } else if (data.action === "requested") {
      pending = { data, index };
    } else if (pending?.data.requestId === data.requestId && pending.data.head === data.head) {
      completed = data.head;
      pending = undefined;
    }
  }
  return { completed, pending };
}

export function hasFinishedResponse(entries: readonly SessionEntry[], after: number): boolean {
  for (let i = entries.length - 1; i > after; i--) {
    const entry = entries[i];
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    return entry.message.stopReason === "stop" && entry.message.content.some(
      block => block.type === "text" && block.text.trim().length > 0,
    );
  }
  return false;
}

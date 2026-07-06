/**
 * WAL Writer - Append notes to the host Obsidian worklog daily note.
 *
 * Registers the `wal_append` tool so Pi sessions running from any repo can
 * write controlled Markdown snippets to:
 *
 *   ~/code/github.com/hrmnjt/worklog/wal/YYYYMMDD.md
 *
 * The tool runs in the host Pi process, not inside Gondolin, and does not mount
 * the vault into the VM. The WAL directory must already exist. Missing daily
 * notes are created from wal/daily.md when present; otherwise the appended note
 * becomes the file content.
 *
 * Command:
 *   /wal status
 *   /wal append <markdown>
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const PERSONAL_REPO_ROOT = path.join(
  os.homedir(),
  "code",
  "github.com",
  "hrmnjt",
);
const WORKLOG_WAL_DIR = path.join(PERSONAL_REPO_ROOT, "worklog", "wal");
const DAILY_TEMPLATE_NAME = "daily.md";
const LOCK_WAIT_TIMEOUT_MS = 30_000;
const STALE_LOCK_MS = 120_000;

const WalAppendParams = Type.Object({
  text: Type.String({
    description:
      "Markdown content to append at the end of the WAL daily note. Include bullets/headings exactly as they should appear.",
  }),
  date: Type.Optional(
    Type.String({
      description:
        "Target note date as YYYYMMDD (the note file is YYYYMMDD.md). Defaults to today in the host local timezone. Also accepts 'today' and 'yesterday'.",
    }),
  ),
});

type WalAppendInput = {
  text: string;
  date?: string;
};

type DateParts = {
  compact: string;
  iso: string;
  yyyy: string;
  mm: string;
  dd: string;
};

type WalConfig = {
  walDir: string;
  templatePath: string;
};

type PathStatus = "exists" | "missing" | "not-directory" | "not-file";

type WalStatus = {
  walDir: string;
  walDirStatus: PathStatus;
  templatePath: string;
  templateStatus: PathStatus;
  todayPath: string;
  todayStatus: PathStatus;
};

type WalAppendDetails = {
  path: string;
  displayPath: string;
  date: string;
  compactDate: string;
  created: boolean;
  templateUsed: boolean;
  templatePath: string;
  appendedBytes: number;
};

function isNodeError(err: unknown, code: string): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: unknown }).code === code,
  );
}

function displayPath(value: string): string {
  const home = os.homedir();
  const rel = path.relative(home, value);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    return path.join("~", rel);
  }
  return value;
}

function getConfig(): WalConfig {
  return {
    walDir: WORKLOG_WAL_DIR,
    templatePath: path.join(WORKLOG_WAL_DIR, DAILY_TEMPLATE_NAME),
  };
}

function localDateParts(date = new Date()): DateParts {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return { compact: `${yyyy}${mm}${dd}`, iso: `${yyyy}-${mm}-${dd}`, yyyy, mm, dd };
}

function parseWalDate(input?: string): DateParts {
  const value = input?.trim().toLowerCase();
  if (!value || value === "today") return localDateParts();

  if (value === "yesterday") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localDateParts(d);
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) {
    throw new Error("date must be YYYYMMDD, today, or yesterday");
  }

  const [, yyyy, mm, dd] = match;
  const year = Number(yyyy);
  const month = Number(mm);
  const day = Number(dd);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`invalid calendar date: ${input}`);
  }

  return { compact: `${yyyy}${mm}${dd}`, iso: `${yyyy}-${mm}-${dd}`, yyyy, mm, dd };
}

function renderTemplate(template: string, date: DateParts): string {
  return template
    .replaceAll("{{date}}", date.iso)
    .replaceAll("{{isoDate}}", date.iso)
    .replaceAll("{{YYYY-MM-DD}}", date.iso)
    .replaceAll("{{YYYYMMDD}}", date.compact)
    .replaceAll("{{yyyy}}", date.yyyy)
    .replaceAll("{{YYYY}}", date.yyyy)
    .replaceAll("{{mm}}", date.mm)
    .replaceAll("{{MM}}", date.mm)
    .replaceAll("{{dd}}", date.dd)
    .replaceAll("{{DD}}", date.dd);
}

async function pathStatus(value: string, expected: "file" | "directory"): Promise<PathStatus> {
  try {
    const stat = await fs.stat(value);
    if (expected === "directory") return stat.isDirectory() ? "exists" : "not-directory";
    return stat.isFile() ? "exists" : "not-file";
  } catch (err) {
    if (isNodeError(err, "ENOENT")) return "missing";
    throw err;
  }
}

async function ensureWalDir(config: WalConfig): Promise<void> {
  const status = await pathStatus(config.walDir, "directory");
  if (status === "exists") return;
  if (status === "missing") {
    throw new Error(
      `WAL directory is missing: ${displayPath(config.walDir)}. ` +
        `Clone or create the worklog repo at ${displayPath(path.dirname(config.walDir))} first.`,
    );
  }
  throw new Error(`WAL path is not a directory: ${displayPath(config.walDir)}`);
}

async function initialNoteContent(
  config: WalConfig,
  date: DateParts,
): Promise<{ content: string; templateUsed: boolean }> {
  try {
    const template = await fs.readFile(config.templatePath, "utf8");
    return { content: renderTemplate(template, date), templateUsed: true };
  } catch (err) {
    if (!isNodeError(err, "ENOENT")) throw err;
    return { content: "", templateUsed: false };
  }
}

function normalizeEntry(text: string): string {
  const entry = text.trim();
  if (!entry) throw new Error("text must not be empty");
  return entry;
}

function appendToEnd(content: string, rawEntry: string): string {
  const entry = normalizeEntry(rawEntry);
  const normalizedContent = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const base = normalizedContent.replace(/\s*$/, "");
  return `${base}${base ? "\n\n" : ""}${entry}\n`;
}

function lockPathFor(targetPath: string): string {
  const digest = crypto.createHash("sha256").update(targetPath).digest("hex").slice(0, 20);
  return path.join(os.tmpdir(), "pi-wal-writer-locks", `${digest}.lock`);
}

function abortError(): Error {
  return new Error("Operation aborted");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);

    function done() {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }

    function onAbort() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function acquireLock(lockDir: string, signal?: AbortSignal): Promise<() => Promise<void>> {
  const started = Date.now();
  await fs.mkdir(path.dirname(lockDir), { recursive: true });

  while (true) {
    throwIfAborted(signal);

    try {
      await fs.mkdir(lockDir);
      try {
        await fs.writeFile(
          path.join(lockDir, "owner.json"),
          JSON.stringify(
            {
              pid: process.pid,
              cwd: process.cwd(),
              createdAt: new Date().toISOString(),
            },
            null,
            2,
          ),
          "utf8",
        );
      } catch (err) {
        await fs.rm(lockDir, { recursive: true, force: true });
        throw err;
      }

      return async () => {
        await fs.rm(lockDir, { recursive: true, force: true });
      };
    } catch (err) {
      if (!isNodeError(err, "EEXIST")) throw err;

      try {
        const stat = await fs.stat(lockDir);
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          await fs.rm(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch (statErr) {
        if (!isNodeError(statErr, "ENOENT")) throw statErr;
        continue;
      }

      if (Date.now() - started > LOCK_WAIT_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for WAL lock: ${lockDir}`);
      }

      await sleep(100, signal);
    }
  }
}

async function withCrossProcessLock<T>(
  targetPath: string,
  signal: AbortSignal | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const release = await acquireLock(lockPathFor(targetPath), signal);
  try {
    throwIfAborted(signal);
    return await fn();
  } finally {
    await release();
  }
}

async function appendWal(
  input: WalAppendInput,
  signal?: AbortSignal,
): Promise<WalAppendDetails> {
  const config = getConfig();
  const date = parseWalDate(input.date);
  const targetPath = path.join(config.walDir, `${date.compact}.md`);
  const entry = normalizeEntry(input.text);

  return withFileMutationQueue(targetPath, () =>
    withCrossProcessLock(targetPath, signal, async () => {
      await ensureWalDir(config);

      let content: string;
      let created = false;
      let templateUsed = false;
      try {
        content = await fs.readFile(targetPath, "utf8");
      } catch (err) {
        if (!isNodeError(err, "ENOENT")) throw err;
        const initial = await initialNoteContent(config, date);
        content = initial.content;
        templateUsed = initial.templateUsed;
        created = true;
      }

      const nextContent = appendToEnd(content, entry);
      await fs.writeFile(targetPath, nextContent, "utf8");

      const details: WalAppendDetails = {
        path: targetPath,
        displayPath: displayPath(targetPath),
        date: date.iso,
        compactDate: date.compact,
        created,
        templateUsed,
        templatePath: config.templatePath,
        appendedBytes: Buffer.byteLength(entry, "utf8"),
      };
      return details;
    }),
  );
}

async function getStatus(config: WalConfig): Promise<WalStatus> {
  const today = parseWalDate();
  const todayPath = path.join(config.walDir, `${today.compact}.md`);
  return {
    walDir: config.walDir,
    walDirStatus: await pathStatus(config.walDir, "directory"),
    templatePath: config.templatePath,
    templateStatus: await pathStatus(config.templatePath, "file"),
    todayPath,
    todayStatus: await pathStatus(todayPath, "file"),
  };
}

function formatAppendSummary(details: WalAppendDetails): string {
  const pieces = [`Appended to ${details.displayPath}`];
  if (details.created) {
    pieces.push(details.templateUsed ? "created from daily.md" : "created new note");
  }
  return pieces.join(" · ");
}

function formatStatus(status: WalStatus): string {
  return [
    "WAL writer",
    `wal dir: ${displayPath(status.walDir)} (${status.walDirStatus})`,
    `today: ${displayPath(status.todayPath)} (${status.todayStatus})`,
    `template: ${displayPath(status.templatePath)} (${status.templateStatus})`,
    "append behavior: end of file, no automatic heading",
  ].join("\n");
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "wal_append",
    label: "WAL Append",
    description:
      "Append Markdown to the end of the host Obsidian WAL daily note at worklog/wal/YYYYMMDD.md. The WAL directory must already exist. Creates a missing daily note from wal/daily.md when present. This writes only to the configured WAL path; it does not mount the vault into Gondolin.",
    promptSnippet:
      "Append Markdown to the end of the host Obsidian WAL daily note (worklog/wal/YYYYMMDD.md).",
    promptGuidelines: [
      "Use wal_append when the user asks to record worklog, WAL, daily-note, or Obsidian vault notes from the current Pi session.",
      "Use wal_append instead of read/write/edit for WAL notes; the WAL vault is host-side and is intentionally not mounted into Gondolin.",
      "wal_append appends exactly the Markdown text you pass at the end of the daily note; include any desired heading or bullet structure in the text itself.",
    ],
    parameters: WalAppendParams,

    async execute(_toolCallId, params, signal) {
      const details = await appendWal(params as WalAppendInput, signal);
      return {
        content: [{ type: "text", text: formatAppendSummary(details) }],
        details,
      };
    },
  });

  pi.registerCommand("wal", {
    description: "WAL writer: /wal status or /wal append <markdown>",
    handler: async (args: string, ctx: ExtensionContext) => {
      const trimmed = args.trim();
      if (!trimmed || trimmed === "status") {
        try {
          ctx.ui.notify(formatStatus(await getStatus(getConfig())), "info");
        } catch (err) {
          ctx.ui.notify(`WAL status failed: ${(err as Error).message}`, "error");
        }
        return;
      }

      if (trimmed === "append" || trimmed.startsWith("append ")) {
        const text = trimmed.slice("append".length).trim();
        if (!text) {
          ctx.ui.notify("Usage: /wal append <markdown>", "warning");
          return;
        }

        try {
          const details = await appendWal({ text });
          ctx.ui.notify(formatAppendSummary(details), "info");
        } catch (err) {
          ctx.ui.notify(`WAL append failed: ${(err as Error).message}`, "error");
        }
        return;
      }

      ctx.ui.notify("Usage: /wal status or /wal append <markdown>", "warning");
    },
  });
}

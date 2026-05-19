/**
 * Usage Tracker - Track token usage and estimated costs across providers
 *
 * Records per-turn usage from pi's LLM responses and displays summaries
 * via /usage commands (no model turn needed).
 *
 * New usage is appended to ~/.pi/agent/usage-data/usage.jsonl.
 * Legacy aggregate data in ~/.pi/agent/usage-data/usage.json is read-only
 * so existing totals from older versions still show up.
 *
 * Usage:
 *   /usage today  — today's usage by provider/model
 *   /usage month — this month's usage
 *   /usage all   — all-time usage
 *   /usage        — same as /usage today
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UsageSnapshot {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

interface UsageEvent extends Omit<UsageSnapshot, "turns"> {
  timestamp: string;
  date: string;
  provider: string;
  model: string;
  api?: string;
}

interface DayData {
  [provider: string]: {
    [model: string]: UsageSnapshot;
  };
}

interface LegacyUsageData {
  version: number;
  days: {
    [date: string]: {
      [provider: string]: {
        [model: string]: Partial<UsageSnapshot>;
      };
    };
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const USAGE_DIR = path.join(os.homedir(), ".pi", "agent", "usage-data");
const USAGE_EVENTS_FILE = path.join(USAGE_DIR, "usage.jsonl");
const LEGACY_USAGE_FILE = path.join(USAGE_DIR, "usage.json");

function isNotFound(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "ENOENT");
}

function appendUsageEvent(event: UsageEvent): void {
  fs.mkdirSync(USAGE_DIR, { recursive: true });
  fs.appendFileSync(USAGE_EVENTS_FILE, `${JSON.stringify(event)}\n`, "utf-8");
}

function loadUsageEvents(): UsageEvent[] {
  let raw: string;
  try {
    raw = fs.readFileSync(USAGE_EVENTS_FILE, "utf-8");
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }

  const events: UsageEvent[] = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let parsed: UsageEvent;
    try {
      parsed = JSON.parse(line) as UsageEvent;
    } catch (err) {
      throw new Error(`Invalid JSON in ${USAGE_EVENTS_FILE}:${i + 1}: ${(err as Error).message}`);
    }

    if (!parsed.date || !parsed.provider || !parsed.model) {
      throw new Error(`Invalid usage event in ${USAGE_EVENTS_FILE}:${i + 1}`);
    }
    events.push(parsed);
  }
  return events;
}

function loadLegacyUsageData(): LegacyUsageData | null {
  let raw: string;
  try {
    raw = fs.readFileSync(LEGACY_USAGE_FILE, "utf-8");
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }

  try {
    const data = JSON.parse(raw) as LegacyUsageData;
    if (data.version !== 1 || !data.days || typeof data.days !== "object") {
      throw new Error("unsupported legacy usage format");
    }
    return data;
  } catch (err) {
    throw new Error(`Invalid legacy usage file ${LEGACY_USAGE_FILE}: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptySnapshot(): UsageSnapshot {
  return {
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function mergeSnapshot(target: UsageSnapshot, source: UsageSnapshot): void {
  target.turns += source.turns;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.reasoningTokens += source.reasoningTokens;
  target.totalTokens += source.totalTokens;
  target.cost.input += source.cost.input;
  target.cost.output += source.cost.output;
  target.cost.cacheRead += source.cost.cacheRead;
  target.cost.cacheWrite += source.cost.cacheWrite;
  target.cost.total += source.cost.total;
}

function addSnapshot(dayData: DayData, provider: string, model: string, snapshot: UsageSnapshot): void {
  if (!dayData[provider]) dayData[provider] = {};
  if (!dayData[provider][model]) dayData[provider][model] = emptySnapshot();
  mergeSnapshot(dayData[provider][model], snapshot);
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function today(): string {
  return localDateString();
}

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function aggregateUsage(from: string): DayData {
  const to = today();
  const merged: DayData = {};

  const legacy = loadLegacyUsageData();
  if (legacy) {
    for (const [date, dayData] of Object.entries(legacy.days)) {
      if (date < from || date > to) continue;
      for (const [provider, models] of Object.entries(dayData)) {
        for (const [model, raw] of Object.entries(models)) {
          addSnapshot(merged, provider, model, {
            turns: num(raw.turns),
            inputTokens: num(raw.inputTokens),
            outputTokens: num(raw.outputTokens),
            cacheReadTokens: num(raw.cacheReadTokens),
            cacheWriteTokens: num(raw.cacheWriteTokens),
            reasoningTokens: num(raw.reasoningTokens),
            totalTokens: num(raw.totalTokens),
            cost: {
              input: num(raw.cost?.input),
              output: num(raw.cost?.output),
              cacheRead: num(raw.cost?.cacheRead),
              cacheWrite: num(raw.cost?.cacheWrite),
              total: num(raw.cost?.total),
            },
          });
        }
      }
    }
  }

  for (const event of loadUsageEvents()) {
    if (event.date < from || event.date > to) continue;
    addSnapshot(merged, event.provider, event.model, { ...event, turns: 1 });
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtCost(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.0001) return "<$0.0001";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function fmtLine(label: string, tokens: number, cost: number): string {
  if (tokens === 0) return "";
  return `${label}: ${fmt(tokens)} (${fmtCost(cost)})`;
}

function formatUsage(dayData: DayData, title: string): string {
  const lines: string[] = [title, ""];
  const sortedProviders = Object.keys(dayData).sort();
  let grandTotal = 0;

  for (const provider of sortedProviders) {
    const models = dayData[provider];
    const sortedModels = Object.keys(models).sort();
    lines.push(provider);

    for (const model of sortedModels) {
      const s = models[model];
      grandTotal += s.cost.total;
      lines.push(`  ${model}: ${s.turns} turns, ${fmt(s.totalTokens)} tokens, ${fmtCost(s.cost.total)}`);

      const parts = [
        fmtLine("in", s.inputTokens, s.cost.input),
        fmtLine("out", s.outputTokens, s.cost.output),
        fmtLine("cache", s.cacheReadTokens, s.cost.cacheRead),
        fmtLine("cache-write", s.cacheWriteTokens, s.cost.cacheWrite),
        s.reasoningTokens > 0 ? `reasoning~: ${fmt(s.reasoningTokens)}` : "",
      ].filter(Boolean);

      if (parts.length) lines.push(`    ${parts.join(" · ")}`);
    }
    lines.push("");
  }

  if (sortedProviders.length > 1) {
    lines.push(`Total: ${fmtCost(grandTotal)}`);
  }

  return lines.join("\n");
}

function estimateReasoningTokens(content: unknown): number {
  if (!Array.isArray(content)) return 0;

  let chars = 0;
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      "type" in block &&
      (block as { type?: unknown }).type === "thinking" &&
      "thinking" in block &&
      typeof (block as { thinking?: unknown }).thinking === "string"
    ) {
      chars += (block as { thinking: string }).thinking.length;
    }
  }

  // Rough estimate: ~4 chars per token for visible thinking text.
  return Math.round(chars / 4);
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  pi.on("turn_end", (event, ctx) => {
    const msg = event.message as any;
    if (!msg || msg.role !== "assistant") return;
    if (msg.stopReason === "aborted" || msg.stopReason === "error") return;
    if (!msg.usage) return;

    const provider = typeof msg.provider === "string" ? msg.provider : "unknown";
    const model = typeof msg.responseModel === "string"
      ? msg.responseModel
      : typeof msg.model === "string"
        ? msg.model
        : "unknown";
    const timestamp = new Date(num(msg.timestamp) || Date.now());
    const usage = msg.usage;

    const usageEvent: UsageEvent = {
      timestamp: timestamp.toISOString(),
      date: localDateString(timestamp),
      provider,
      model,
      api: typeof msg.api === "string" ? msg.api : undefined,
      inputTokens: num(usage.input),
      outputTokens: num(usage.output),
      cacheReadTokens: num(usage.cacheRead),
      cacheWriteTokens: num(usage.cacheWrite),
      reasoningTokens: estimateReasoningTokens(msg.content),
      totalTokens: num(usage.totalTokens),
      cost: {
        input: num(usage.cost?.input),
        output: num(usage.cost?.output),
        cacheRead: num(usage.cost?.cacheRead),
        cacheWrite: num(usage.cost?.cacheWrite),
        total: num(usage.cost?.total),
      },
    };

    try {
      appendUsageEvent(usageEvent);
    } catch (err) {
      ctx.ui.notify(`Failed to record usage: ${(err as Error).message}`, "error");
    }
  });

  pi.registerCommand("usage", {
    description: "Token usage and cost tracking: /usage [today|month|all]",
    handler: async (args, ctx) => {
      const sub = args.trim().toLowerCase() || "today";

      let from: string;
      let title: string;
      switch (sub) {
        case "today":
          from = today();
          title = `📊 Usage today (${from})`;
          break;
        case "month":
          from = monthStart();
          title = `📊 Usage this month (since ${from})`;
          break;
        case "all":
          from = "0000-00-00";
          title = "📊 All-time usage";
          break;
        default:
          ctx.ui.notify(`Unknown option: "${sub}". Use: today, month, all`, "warning");
          return;
      }

      let dayData: DayData;
      try {
        dayData = aggregateUsage(from);
      } catch (err) {
        ctx.ui.notify(`Failed to read usage data: ${(err as Error).message}`, "error");
        return;
      }

      if (Object.keys(dayData).length === 0) {
        ctx.ui.notify("No usage data recorded for this period.", "info");
        return;
      }

      ctx.ui.notify(formatUsage(dayData, title), "info");
    },
  });
}

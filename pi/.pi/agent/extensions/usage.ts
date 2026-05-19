/**
 * Usage Tracker - Track token usage and estimated costs across providers
 *
 * Records per-turn usage from pi's LLM responses and displays summaries
 * via /usage commands (no model turn needed).
 *
 * Data is stored in ~/.pi/agent/usage-data/usage.json
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
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

interface DayData {
  [provider: string]: {
    [model: string]: UsageSnapshot;
  };
}

interface UsageData {
  version: number;
  days: {
    [date: string]: DayData;
  };
}

interface SessionAccumulator {
  [provider: string]: {
    [model: string]: UsageSnapshot & { reasoningTokens: number };
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const USAGE_DIR = path.join(os.homedir(), ".pi", "agent", "usage-data");
const USAGE_FILE = path.join(USAGE_DIR, "usage.json");

function loadUsageData(): UsageData {
  try {
    const raw = fs.readFileSync(USAGE_FILE, "utf-8");
    const data = JSON.parse(raw);
    if (data.version === 1) return data;
  } catch {
    // File doesn't exist or is invalid
  }
  return { version: 1, days: {} };
}

function saveUsageData(data: UsageData): void {
  fs.mkdirSync(USAGE_DIR, { recursive: true });
  fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeSnapshot(target: UsageSnapshot, source: UsageSnapshot): void {
  target.turns += source.turns;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.totalTokens += source.totalTokens;
  target.cost.input += source.cost.input;
  target.cost.output += source.cost.output;
  target.cost.cacheRead += source.cost.cacheRead;
  target.cost.cacheWrite += source.cost.cacheWrite;
  target.cost.total += source.cost.total;
}

function emptySnapshot(): UsageSnapshot {
  return {
    turns: 0, inputTokens: 0, outputTokens: 0,
    cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function aggregateDays(data: UsageData, from: string): DayData {
  const to = today();
  const merged: DayData = {};
  for (const [date, dayData] of Object.entries(data.days)) {
    if (date < from || date > to) continue;
    for (const [provider, models] of Object.entries(dayData)) {
      if (!merged[provider]) merged[provider] = {};
      for (const [model, snap] of Object.entries(models)) {
        if (!merged[provider][model]) {
          merged[provider][model] = emptySnapshot();
        }
        mergeSnapshot(merged[provider][model], snap);
      }
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function fmtLine(label: string, tokens: number, cost: number): string {
  if (tokens === 0) return "";
  return `${label}: ${fmt(tokens)} (${fmtCost(cost)})`;
}

function formatUsage(dayData: DayData, title: string): string {
  const lines: string[] = [title, ""];

  let grandTotal = 0;
  const sortedProviders = Object.keys(dayData).sort();

  for (const provider of sortedProviders) {
    const models = dayData[provider];
    let providerTotal = 0;
    const sortedModels = Object.keys(models).sort();

    lines.push(provider);

    for (const model of sortedModels) {
      const s = models[model];
      providerTotal += s.cost.total;

      lines.push(`  ${model}: ${s.turns} turns, ${fmt(s.totalTokens)} tokens, ${fmtCost(s.cost.total)}`);

      const parts: string[] = [];
      const input = fmtLine("in", s.inputTokens, s.cost.input);
      const output = fmtLine("out", s.outputTokens, s.cost.output);
      const cacheRead = fmtLine("cache", s.cacheReadTokens, s.cost.cacheRead);
      if (input) parts.push(input);
      if (output) parts.push(output);
      if (cacheRead) parts.push(cacheRead);
      if (parts.length) lines.push(`    ${parts.join(" · ")}`);
    }

    grandTotal += providerTotal;
    lines.push("");
  }

  if (sortedProviders.length > 1) {
    lines.push(`Total: ${fmtCost(grandTotal)}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  const sessionAcc: SessionAccumulator = {};
  let sessionStart: number | null = null;

  pi.on("turn_end", (event) => {
    const msg = event.message as any;
    if (!msg || msg.role !== "assistant") return;
    if (msg.stopReason === "aborted" || msg.stopReason === "error") return;

    const usage = msg.usage;
    if (!usage) return;

    const provider: string = msg.provider || "unknown";
    const model: string = msg.responseModel || msg.model || "unknown";

    // Estimate reasoning tokens from thinking content blocks
    let reasoningChars = 0;
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block?.type === "thinking" && typeof block.thinking === "string") {
          reasoningChars += block.thinking.length;
        }
      }
    }
    const reasoningTokens = Math.round(reasoningChars / 4);

    // Session accumulator
    if (!sessionAcc[provider]) sessionAcc[provider] = {};
    if (!sessionAcc[provider][model]) {
      sessionAcc[provider][model] = { ...emptySnapshot(), reasoningTokens: 0 };
    }
    const sa = sessionAcc[provider][model];
    sa.turns += 1;
    sa.inputTokens += usage.input || 0;
    sa.outputTokens += usage.output || 0;
    sa.cacheReadTokens += usage.cacheRead || 0;
    sa.cacheWriteTokens += usage.cacheWrite || 0;
    sa.totalTokens += usage.totalTokens || 0;
    sa.cost.input += usage.cost?.input || 0;
    sa.cost.output += usage.cost?.output || 0;
    sa.cost.cacheRead += usage.cost?.cacheRead || 0;
    sa.cost.cacheWrite += usage.cost?.cacheWrite || 0;
    sa.cost.total += usage.cost?.total || 0;
    sa.reasoningTokens += reasoningTokens;

    // Persist daily aggregate
    const date = new Date(msg.timestamp || Date.now()).toISOString().slice(0, 10);
    const data = loadUsageData();
    if (!data.days[date]) data.days[date] = {};
    if (!data.days[date][provider]) data.days[date][provider] = {};
    if (!data.days[date][provider][model]) {
      data.days[date][provider][model] = emptySnapshot();
    }

    const turnSnap: UsageSnapshot = {
      turns: 1,
      inputTokens: usage.input || 0,
      outputTokens: usage.output || 0,
      cacheReadTokens: usage.cacheRead || 0,
      cacheWriteTokens: usage.cacheWrite || 0,
      totalTokens: usage.totalTokens || 0,
      cost: {
        input: usage.cost?.input || 0,
        output: usage.cost?.output || 0,
        cacheRead: usage.cost?.cacheRead || 0,
        cacheWrite: usage.cost?.cacheWrite || 0,
        total: usage.cost?.total || 0,
      },
    };
    mergeSnapshot(data.days[date][provider][model], turnSnap);
    saveUsageData(data);
  });

  pi.on("session_start", () => {
    sessionStart = Date.now();
    for (const key of Object.keys(sessionAcc)) delete sessionAcc[key];
  });

  pi.registerCommand("usage", {
    description: "Token usage and cost tracking: /usage [today|month|all]",
    handler: async (args, ctx) => {
      const sub = args.trim().toLowerCase() || "today";
      const data = loadUsageData();

      let dayData: DayData;
      let title: string;

      switch (sub) {
        case "today":
          dayData = data.days[today()] || {};
          title = `📊 Usage today (${today()})`;
          break;
        case "month":
          dayData = aggregateDays(data, monthStart());
          title = `📊 Usage this month (since ${monthStart()})`;
          break;
        case "all":
          dayData = aggregateDays(data, "0000-00-00");
          title = "📊 All-time usage";
          break;
        default:
          ctx.ui.notify(`Unknown option: "${sub}". Use: today, month, all`, "warning");
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
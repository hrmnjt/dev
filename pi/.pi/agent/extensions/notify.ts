/**
 * Notify - OSC 777 desktop notification when pi finishes and waits for input.
 *
 * Inspired by https://github.com/mitsuhiko/agent-stuff/blob/main/extensions/notify.ts
 *
 * Usage:
 * - Automatic: after each agent run completes, a notification is sent.
 * - `/notify test` sends a test notification.
 * - `/notify on|off|status` toggles/statuses notifications for the current pi process.
 *
 * Configuration via environment variables:
 * - PI_NOTIFY=0|false|off      Disable notifications at startup
 * - PI_NOTIFY_MAX_BODY=220     Max notification body length
 * - PI_NOTIFY_LABEL=...        Override the window/session label shown in alerts
 */

import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type MessageLike = { role?: string; content?: unknown };

function envFlag(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
}

function getMaxBodyLength(): number {
  const n = Number.parseInt(process.env.PI_NOTIFY_MAX_BODY ?? "220", 10);
  return Number.isFinite(n) && n > 0 ? n : 220;
}

function runText(command: string, args: string[], cwd = process.cwd()): string | null {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function getGitBranch(): string | null {
  return runText("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
}

function getGitRepoName(): string | null {
  const top = runText("git", ["rev-parse", "--show-toplevel"]);
  if (!top) return null;

  // In linked worktrees named like dev.worktrees/feat/pi/notify, the basename
  // is just "notify". Prefer the primary repo name from git-common-dir, which
  // points at <primary-repo>/.git for normal repos and linked worktrees.
  const common = runText("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (common && path.basename(common) === ".git") {
    return path.basename(path.dirname(common)) || null;
  }

  return path.basename(top) || null;
}

function getTtyLabel(): string | null {
  return runText("tty", []);
}

function getSessionLabel(): string {
  if (process.env.PI_NOTIFY_LABEL?.trim()) return process.env.PI_NOTIFY_LABEL.trim();

  const repo = getGitRepoName();
  const branch = getGitBranch();
  const tty = getTtyLabel();
  const parts: string[] = [];

  if (repo && branch && branch !== "HEAD") parts.push(`${repo}:${branch}`);
  else if (repo) parts.push(repo);
  else parts.push(path.basename(process.cwd()) || "pi");

  if (tty) parts.push(path.basename(tty));
  return parts.join(" · ");
}

function isTextPart(part: unknown): part is { type: "text"; text: string } {
  return Boolean(
    part &&
      typeof part === "object" &&
      "type" in part &&
      (part as { type?: unknown }).type === "text" &&
      "text" in part &&
      typeof (part as { text?: unknown }).text === "string",
  );
}

function extractLastAssistantText(messages: MessageLike[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;

    const content = message.content;
    if (typeof content === "string") {
      return content.trim() || null;
    }

    if (Array.isArray(content)) {
      const text = content
        .filter(isTextPart)
        .map((part) => part.text)
        .join("\n")
        .trim();
      return text || null;
    }

    return null;
  }

  return null;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeOSCField(text: string): string {
  // OSC 777 is `ESC ] 777 ; notify ; title ; body BEL`. Remove controls and
  // semicolons so content cannot terminate or shift fields.
  return text
    .replace(/[\x00-\x1f\x7f\x9b]/g, " ")
    .replace(/;/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatNotification(
  text: string | null,
  sessionLabel: string,
): { title: string; body: string } {
  const summary = text ? truncate(sanitizeOSCField(stripMarkdown(text)), getMaxBodyLength()) : "";

  return {
    title: `π Ready · ${sessionLabel}`,
    body: summary ? `Go to ${sessionLabel}: ${summary}` : `Go to ${sessionLabel}: waiting for input.`,
  };
}

function notifyOSC777(title: string, body: string): void {
  // Ghostty, iTerm2, rxvt-unicode: ESC ] 777 ; notify ; title ; body BEL
  process.stdout.write(`\x1b]777;notify;${sanitizeOSCField(title)};${sanitizeOSCField(body)}\x07`);
}

export default function (pi: ExtensionAPI) {
  let enabled = envFlag("PI_NOTIFY", true);
  const sessionLabel = getSessionLabel();

  pi.on("agent_end", async (event, ctx) => {
    if (!enabled) return;
    if (ctx.hasPendingMessages()) return;

    const text = extractLastAssistantText((event.messages ?? []) as MessageLike[]);
    const { title, body } = formatNotification(text, sessionLabel);
    notifyOSC777(title, body);
  });

  pi.registerCommand("notify", {
    description: "Control OSC 777 desktop notifications: /notify test|on|off|status",
    handler: async (args, ctx) => {
      const command = args.trim().toLowerCase() || "status";

      if (command === "on") {
        enabled = true;
        ctx.ui.notify("Notifications enabled", "info");
        return;
      }

      if (command === "off") {
        enabled = false;
        ctx.ui.notify("Notifications disabled", "info");
        return;
      }

      if (command === "test") {
        const { title, body } = formatNotification("Notifications are working.", sessionLabel);
        notifyOSC777(title, body);
        ctx.ui.notify("Sent OSC 777 test notification", "info");
        return;
      }

      if (command === "status") {
        ctx.ui.notify(
          `Notifications ${enabled ? "enabled" : "disabled"}; backend: osc777; label: ${sessionLabel}`,
          "info",
        );
        return;
      }

      ctx.ui.notify("Usage: /notify test|on|off|status", "warning");
    },
  });
}

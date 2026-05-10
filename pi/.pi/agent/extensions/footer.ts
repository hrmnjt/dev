/**
 * Custom Footer — merges gondolin status into the cwd/branch line
 *
 * Replaces pi's default 3-line footer with a 2-line layout:
 *   Line 1: <cwd> (<branch>) on gondolin
 *   Line 2: <token stats>                        <model info>
 *
 * The gondolin status is read from the extension status map and folded
 * into line 1 instead of appearing on its own line.
 *
 * Toggle with /footer to switch between custom and default.
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { homedir } from "node:os";

export default function (pi: ExtensionAPI) {
  let enabled = true;

  function formatTokens(n: number): string {
    if (n < 1000) return `${n}`;
    if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
    return `${(n / 1_000_000).toFixed(1)}M`;
  }

  pi.registerCommand("footer", {
    description: "Toggle custom footer",
    handler: async (_args, ctx) => {
      enabled = !enabled;
      if (enabled) {
        installFooter(ctx);
        ctx.ui.notify("Custom footer enabled", "info");
      } else {
        ctx.ui.setFooter(undefined);
        ctx.ui.notify("Default footer restored", "info");
      }
    },
  });

  function installFooter(ctx: any) {
    ctx.ui.setFooter((tui: any, theme: any, footerData: any) => {
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          // --- Token stats from session ------------------------------------
          let input = 0, output = 0, reasoning = 0, cost = 0;
          for (const e of ctx.sessionManager?.getBranch?.() ?? []) {
            if (e.type === "message" && e.message?.role === "assistant") {
              const m = e.message as AssistantMessage;
              input += m.usage?.input ?? 0;
              output += m.usage?.output ?? 0;
              reasoning += (m.usage?.cacheRead ?? 0) + (m.usage?.cacheWrite ?? 0);
              cost += m.usage?.cost?.total ?? 0;
            }
          }

          // --- Context usage ------------------------------------------------
          const usage = ctx.getContextUsage?.();
          const ctxPct = usage?.tokens && usage?.contextWindow
            ? `${((usage.tokens / usage.contextWindow) * 100).toFixed(1)}%/${(usage.contextWindow / 1_000_000).toFixed(1)}M`
            : "";

          // --- Line 1: cwd + branch + gondolin status ----------------------
          const shortCwd = (ctx.cwd ?? "").replace(homedir(), "~");
          const branch = footerData.getGitBranch();
          const branchStr = branch ? ` (${branch})` : "";

          const statuses = footerData.getExtensionStatuses() as Map<string, string>;
          const gondolinRaw = statuses?.get("gondolin") ?? "";
          // Extract state word: "Gondolin: running ..." → "running"
          const gondolinState = gondolinRaw.match(/Gondolin:\s*(\S+)/)?.[1];
          const gondolinStr = gondolinState ? ` on gondolin: ${gondolinState}` : "";

          const line1 = theme.fg("muted", `${shortCwd}${branchStr}${gondolinStr}`);

          // --- Line 2: token stats (left) + model info (right) --------------
          const parts: string[] = [];
          if (input > 0) parts.push(theme.fg("dim", `↑${formatTokens(input)}`));
          if (output > 0) parts.push(theme.fg("dim", `↓${formatTokens(output)}`));
          if (reasoning > 0) parts.push(theme.fg("dim", `R${formatTokens(reasoning)}`));
          if (cost > 0) parts.push(theme.fg("dim", `$${cost.toFixed(3)}`));
          if (ctxPct) parts.push(theme.fg("dim", ctxPct));
          parts.push(theme.fg("dim", "(auto)"));

          const left = parts.join(" ");

          const model = ctx.model;
          const provider = model?.provider ?? "";
          const modelName = model?.name ?? model?.id ?? "?";
          const thinking = pi.getThinkingLevel();
          const thinkingStr = thinking && thinking !== "off" ? ` • ${thinking}` : "";
          const right = theme.fg("dim", `(${provider}) ${modelName}${thinkingStr}`);

          const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
          const line2 = truncateToWidth(left + pad + right, width);

          return [line1, line2];
        },
      };
    });
  }

  pi.on("session_start", (_event, ctx) => {
    if (enabled) installFooter(ctx);
  });
}

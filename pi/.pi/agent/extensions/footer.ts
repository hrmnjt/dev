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
          try {
            // --- Token stats from session ----------------------------------
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

            // --- Line 1: cwd + branch + gondolin status --------------------
            const shortCwd = (ctx.cwd ?? "").replace(homedir(), "~");
            const branch = footerData.getGitBranch();
            const branchStr = branch ? ` (${branch})` : "";

            const statuses = footerData.getExtensionStatuses() as Map<string, string>;
            const gondolinRaw = statuses?.get("gondolin") ?? "";
            const gondolinState = gondolinRaw.match(/Gondolin:\s*(\S+)/)?.[1];
            const gondolinStr = gondolinState ? ` on gondolin: ${gondolinState}` : "";

            const line1 = truncateToWidth(
              theme.fg("muted", `${shortCwd}${branchStr}${gondolinStr}`),
              width,
            );

            // --- Line 2: token stats (left) + model info (right) -----------
            const parts: string[] = [];
            if (input > 0) parts.push(`↑${formatTokens(input)}`);
            if (output > 0) parts.push(`↓${formatTokens(output)}`);
            if (reasoning > 0) parts.push(`R${formatTokens(reasoning)}`);
            if (cost > 0) parts.push(`$${cost.toFixed(3)}`);
            const ctxPct = (() => {
              const u = ctx.getContextUsage?.();
              if (u?.tokens && u?.contextWindow) {
                return `${((u.tokens / u.contextWindow) * 100).toFixed(1)}%/${(u.contextWindow / 1_000_000).toFixed(1)}M`;
              }
              return "";
            })();
            if (ctxPct) parts.push(ctxPct);
            parts.push("(auto)");

            const left = parts.join(" ");

            const model = ctx.model;
            const provider = model?.provider ?? "";
            const modelName = model?.name ?? model?.id ?? "?";
            const thinking = pi.getThinkingLevel();
            const thinkingStr = thinking && thinking !== "off" ? ` • ${thinking}` : "";
            const right = `(${provider}) ${modelName}${thinkingStr}`;

            // Build line 2 with padding, then apply dim as a single wrap
            const leftW = visibleWidth(left);
            const rightW = visibleWidth(right);
            const pad = " ".repeat(Math.max(1, width - leftW - rightW));
            const line2 = truncateToWidth(theme.fg("dim", left + pad + right), width);

            return [line1, line2];
          } catch {
            // Never let a footer error corrupt the terminal
            return [theme.fg("warning", "footer error")];
          }
        },
      };
    });
  }

  pi.on("session_start", (_event, ctx) => {
    if (enabled) installFooter(ctx);
  });
}

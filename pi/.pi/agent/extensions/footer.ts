/**
 * Custom Footer — merges gondolin status into the cwd/branch line
 *
 * Replaces pi's default footer with pi's own rendering logic (copied 1:1
 * from the FooterComponent source) with one change: gondolin extension
 * status is folded into the pwd/branch line instead of appearing on a
 * separate third line. All other behavior matches pi's default.
 *
 * Toggle with /footer to switch between custom and default.
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

// ---------------------------------------------------------------------------
// Helpers — copied 1:1 from pi's FooterComponent
// ---------------------------------------------------------------------------

function sanitizeStatusText(text: string): string {
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  let enabled = true;

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
    ctx.ui.setFooter((_tui: any, theme: any, footerData: any) => {
      const unsub = footerData.onBranchChange(() => _tui.requestRender());

      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          try {
            const state = ctx.sessionManager?.state;

            // --- Cumulative usage (1:1 from FooterComponent) ---------------
            let totalInput = 0, totalOutput = 0,
              totalCacheRead = 0, totalCacheWrite = 0, totalCost = 0;
            for (const entry of ctx.sessionManager?.getEntries?.() ?? []) {
              if (entry.type === "message" && entry.message?.role === "assistant") {
                const m = entry.message as AssistantMessage;
                totalInput += m.usage?.input ?? 0;
                totalOutput += m.usage?.output ?? 0;
                totalCacheRead += m.usage?.cacheRead ?? 0;
                totalCacheWrite += m.usage?.cacheWrite ?? 0;
                totalCost += m.usage?.cost?.total ?? 0;
              }
            }

            // --- Context usage (1:1 from FooterComponent) ------------------
            const contextUsage = ctx.getContextUsage?.();
            const contextWindow = contextUsage?.contextWindow ?? state?.model?.contextWindow ?? 0;
            const contextPercentValue = contextUsage?.percent ?? 0;
            const contextPercent = contextUsage?.percent != null
              ? contextPercentValue.toFixed(1)
              : "?";

            // --- Pwd line (1:1, then we add gondolin) ----------------------
            let pwd = ctx.sessionManager?.getCwd?.() ?? ctx.cwd ?? "";
            const home = process.env.HOME || process.env.USERPROFILE;
            if (home && pwd.startsWith(home)) {
              pwd = `~${pwd.slice(home.length)}`;
            }
            const branch = footerData.getGitBranch();
            if (branch) pwd = `${pwd} (${branch})`;
            const sessionName = ctx.sessionManager?.getSessionName?.();
            if (sessionName) pwd = `${pwd} • ${sessionName}`;

            // --- OUR CHANGE: fold gondolin status into pwd line ------------
            const statuses = footerData.getExtensionStatuses() as Map<string, string>;
            const gondolinRaw = statuses?.get("gondolin") ?? "";
            const gondolinState = gondolinRaw.match(/Gondolin:\s*(\S+)/)?.[1];
            if (gondolinState) {
              pwd = `${pwd} on gondolin: ${gondolinState}`;
              delete statuses?.delete?.("gondolin"); // remove so it doesn't appear below
            }

            // --- Stats line (1:1 from FooterComponent) ---------------------
            const statsParts: string[] = [];
            if (totalInput) statsParts.push(`↑${formatTokens(totalInput)}`);
            if (totalOutput) statsParts.push(`↓${formatTokens(totalOutput)}`);
            if (totalCacheRead) statsParts.push(`R${formatTokens(totalCacheRead)}`);
            if (totalCacheWrite) statsParts.push(`W${formatTokens(totalCacheWrite)}`);

            const usingSubscription = state?.model
              ? ctx.modelRegistry?.isUsingOAuth?.(state.model) ?? false
              : false;
            if (totalCost || usingSubscription) {
              const costStr = `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`;
              statsParts.push(costStr);
            }

            // Color-coded context percentage (1:1)
            const autoEnabled = true; // pi default
            const autoIndicator = autoEnabled ? " (auto)" : "";
            const contextPercentDisplay = contextPercent === "?"
              ? `?/${formatTokens(contextWindow)}${autoIndicator}`
              : `${contextPercent}%/${formatTokens(contextWindow)}${autoIndicator}`;

            let contextPercentStr: string;
            if (contextPercentValue > 90) {
              contextPercentStr = theme.fg("error", contextPercentDisplay);
            } else if (contextPercentValue > 70) {
              contextPercentStr = theme.fg("warning", contextPercentDisplay);
            } else {
              contextPercentStr = contextPercentDisplay;
            }
            statsParts.push(contextPercentStr);

            let statsLeft = statsParts.join(" ");

            // --- Model info (1:1 from FooterComponent) ---------------------
            const modelName = state?.model?.id || "no-model";
            let statsLeftWidth = visibleWidth(statsLeft);
            if (statsLeftWidth > width) {
              statsLeft = truncateToWidth(statsLeft, width, "...");
              statsLeftWidth = visibleWidth(statsLeft);
            }

            const minPadding = 2;
            let rightSideWithoutProvider = modelName;
            if (state?.model?.reasoning) {
              const thinkingLevel = state?.thinkingLevel || "off";
              rightSideWithoutProvider = thinkingLevel === "off"
                ? `${modelName} • thinking off`
                : `${modelName} • ${thinkingLevel}`;
            }

            let rightSide = rightSideWithoutProvider;
            if (footerData.getAvailableProviderCount?.() > 1 && state?.model) {
              const candidate = `(${state.model.provider}) ${rightSideWithoutProvider}`;
              if (statsLeftWidth + minPadding + visibleWidth(candidate) <= width) {
                rightSide = candidate;
              }
            }

            const rightSideWidth = visibleWidth(rightSide);
            const totalNeeded = statsLeftWidth + minPadding + rightSideWidth;
            let statsLine: string;
            if (totalNeeded <= width) {
              const padding = " ".repeat(width - statsLeftWidth - rightSideWidth);
              statsLine = statsLeft + padding + rightSide;
            } else {
              const availableForRight = width - statsLeftWidth - minPadding;
              if (availableForRight > 0) {
                const truncatedRight = truncateToWidth(rightSide, availableForRight, "");
                const truncatedRightWidth = visibleWidth(truncatedRight);
                const padding = " ".repeat(Math.max(0, width - statsLeftWidth - truncatedRightWidth));
                statsLine = statsLeft + padding + truncatedRight;
              } else {
                statsLine = statsLeft;
              }
            }

            // Apply dim (1:1 — statsLeft may contain color codes so dim separately)
            const dimStatsLeft = theme.fg("dim", statsLeft);
            const remainder = statsLine.slice(statsLeft.length);
            const dimRemainder = theme.fg("dim", remainder);

            const pwdLine = truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "..."));
            const lines = [pwdLine, dimStatsLeft + dimRemainder];

            // --- Extension statuses (1:1, but gondolin already merged) ------
            if (statuses?.size > 0) {
              const sortedStatuses = Array.from(statuses.entries())
                .sort(([a]: any, [b]: any) => String(a).localeCompare(String(b)))
                .map(([, text]: any) => sanitizeStatusText(String(text)));
              const statusLine = sortedStatuses.join(" ");
              lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
            }

            return lines;
          } catch {
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

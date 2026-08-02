import { spawn, type ChildProcess } from "node:child_process";

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const IS_MACOS = process.platform === "darwin";
const CAFFEINATE_PATH = "/usr/bin/caffeinate";

export default function (pi: ExtensionAPI) {
  let caffeinateProcess: ChildProcess | undefined;

  function notifyError(ctx: ExtensionContext, message: string): void {
    if (ctx.hasUI) ctx.ui.notify(message, "error");
  }

  function start(ctx: ExtensionContext): void {
    if (!IS_MACOS || caffeinateProcess) return;

    const child = spawn(
      CAFFEINATE_PATH,
      ["-i", "-s", "-w", String(process.pid)],
      { stdio: "ignore" },
    );
    caffeinateProcess = child;
    child.unref();

    child.once("error", (error) => {
      if (caffeinateProcess !== child) return;
      caffeinateProcess = undefined;
      notifyError(ctx, `Caffeinate failed: ${error.message}`);
    });

    child.once("exit", (code, signal) => {
      if (caffeinateProcess !== child) return;
      caffeinateProcess = undefined;

      const reason = signal
        ? `signal ${signal}`
        : `exit code ${code ?? "unknown"}`;
      notifyError(ctx, `Caffeinate stopped unexpectedly (${reason})`);
    });
  }

  function stop(): void {
    const child = caffeinateProcess;
    caffeinateProcess = undefined;

    if (child?.exitCode === null && !child.killed) {
      child.kill("SIGTERM");
    }
  }

  pi.on("agent_start", (_event, ctx) => {
    start(ctx);
  });

  pi.on("agent_settled", () => {
    stop();
  });

  pi.on("session_shutdown", () => {
    stop();
  });
}

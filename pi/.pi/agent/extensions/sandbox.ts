/** Mandatory macOS write confinement, matching Gondolin's launch-directory workflow. */
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  createBashToolDefinition, createLocalBashOperations, createReadToolDefinition,
  createWriteToolDefinition, createEditToolDefinition, getDocsPath, getExamplesPath,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { NativeRuntime, imageMimeType } from "./lib/native-runtime.ts";
import { getBlockedCommandMessage } from "./uv.js";

const ALLOWED_TOOLS = new Set(["read", "write", "edit", "bash", "codemode", "tool_search",
  "wal_append", "tldraw_guide", "tldraw_search", "tldraw_exec", "tldraw_screenshot"]);

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();
  const runtime = new NativeRuntime(cwd, createLocalBashOperations({ shellPath: "/bin/bash" }));
  async function ready() { return runtime.ensureReady(); }

  // Also guards unsupported built-ins activated later and nested/codemode calls.
  pi.on("tool_call", async event => {
    await ready();
    if (!ALLOWED_TOOLS.has(event.toolName)) return { block: true, reason: `Native sandbox does not support tool ${event.toolName}.` };
  });

  pi.registerTool({
    ...createReadToolDefinition(cwd),
    async execute(id, params, signal, onUpdate, ctx) {
      await ready();
      return createReadToolDefinition(cwd, { operations: {
        access: async p => { await runtime.file("access", p, signal); },
        readFile: p => runtime.file("read", p, signal),
        detectImageMimeType: async p => imageMimeType(await runtime.file("head", p, signal)),
      } }).execute(id, params, signal, onUpdate, ctx);
    },
  });
  pi.registerTool({
    ...createWriteToolDefinition(cwd),
    async execute(id, params, signal, onUpdate, ctx) {
      const policy = await ready();
      // Match Pi 1.0's file-path normalization before its mkdir operation.
      let input = params.path.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ").replace(/^@/, "");
      input = input.replace(/^~(?=\/|$)/, os.homedir());
      if (input.startsWith("file://")) input = fileURLToPath(input);
      await policy.assertWrite(path.resolve(ctx.cwd, input));
      return createWriteToolDefinition(cwd, { operations: {
        mkdir: async p => { await runtime.file("mkdir", p, signal); },
        writeFile: async (p, content) => { await runtime.file("write", p, signal, content); },
      } }).execute(id, params, signal, onUpdate, ctx);
    },
  });
  pi.registerTool({
    ...createEditToolDefinition(cwd),
    async execute(id, params, signal, onUpdate, ctx) {
      const policy = await ready();
      return createEditToolDefinition(cwd, { operations: {
        access: async p => { await policy.assertWrite(p); await runtime.file("access", p, signal); },
        readFile: p => runtime.file("read", p, signal),
        writeFile: async (p, content) => { await runtime.file("write", p, signal, content); },
      } }).execute(id, params, signal, onUpdate, ctx);
    },
  });
  pi.registerTool({
    ...createBashToolDefinition(cwd),
    async execute(id, params, signal, onUpdate, ctx) {
      await ready();
      const blocked = getBlockedCommandMessage(params.command);
      if (blocked) throw new Error(blocked);
      const tool = createBashToolDefinition(cwd, { operations: { exec: (command, directory, options) => runtime.exec(command, directory, options) } });
      const result = await tool.execute(id, params, signal, update => {
        if (update.details?.fullOutputPath) runtime.allowOutputFile(update.details.fullOutputPath);
        onUpdate?.(update);
      }, ctx);
      if (result.details?.fullOutputPath) runtime.allowOutputFile(result.details.fullOutputPath);
      return result;
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    try {
      await ready();
    } catch (error) {
      ctx.ui.notify(`Native sandbox blocked: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  });
  pi.on("session_shutdown", async () => { await runtime.dispose(); });
  pi.registerCommand("sandbox", {
    description: "Show native write boundary and Git metadata exceptions",
    handler: async (_args, ctx) => {
      const policy = await ready();
      ctx.ui.notify(`Backend: native\nLaunch directory: ${policy.root}\nScratch/cache: ${policy.scratch}\nGit metadata (bash): ${policy.gitMetadata.join(", ") || "none"}\nNetwork/IPC: not restricted by this profile\nDocs: ${getDocsPath()}\nExamples: ${getExamplesPath()}`, "info");
    },
  });
  pi.on("before_agent_start", async event => {
    const policy = await ready();
    return { systemPrompt: `${event.systemPrompt}\n\nNative macOS write confinement:\n- Use real host paths. The write boundary is the launch directory: ${policy.root}; changing shell cwd does not widen it.\n- Private scratch/cache: ${policy.scratch}. Bash also permits this checkout's Git metadata: ${policy.gitMetadata.join(", ") || "none"}. Other filesystem writes are blocked; symlinks resolve to their real targets.\n- Never route blocked filesystem writes through other host processes/services to bypass the boundary; ask for deliberate user !/!! or terminal operations instead.\n- Use bash Git commands for status, staging, commits, fetch and push when requested; do not hand-edit Git metadata through file tools. Git requires configured identity, with no fallback.\n- Network/IPC are not restricted by this profile. Package installs may write only to the launch directory/private cache; global installs, Stow, launchd, VPN and local-model management remain deliberate user operations.\n- Ordinary host reads and CLI authentication are available. Do not expose credentials in tool output or send private files to network services without approval.\n- The dev model cache remains excluded when beneath the launch directory. File helpers read regular files up to 64 MiB.\n- Read large-output logs at the returned paths; owned logs and scratch are removed on clean shutdown/reload.\n- WAL and tldraw remain narrow trusted integrations; consult tldraw_guide and use its registered tools.\n- Installed Pi docs: ${getDocsPath()}; examples: ${getExamplesPath()}.\n- Stow-linked Pi source inside this boundary is editable. Changes affect new/reloaded sessions everywhere; this session keeps its loaded rules.\n- This is filesystem write confinement, not VM isolation: trusted extensions and other host services can have effects outside the tool boundary.` };
  });
  // Intentionally leave user_bash alone: ! and !! remain deliberate host operations.
}

/**
 * Gondolin Sandbox Extension for pi
 *
 * Overrides pi's built-in read/write/edit/bash tools so they execute inside a
 * Gondolin micro-VM instead of on the host.
 *
 * The directory you start pi in is mounted read-write at /workspace
 * inside the VM.
 *
 * Based on pi's official Gondolin extension example, with local customizations:
 *   - custom VM image support via GONDOLIN_GUEST_DIR
 *   - krun auto-selection on Apple Silicon
 *   - Git over SSH via Gondolin's SSH bridge
 *   - primary-repository-based git identity selection
 *   - dev repository model cache excluded from the workspace mount
 *   - pi docs/examples mounted at /pi/docs and /pi/examples
 *   - user-entered !/!! commands intentionally remain host-side
 *
 * Requirements:
 *   - QEMU installed (brew install qemu) — fallback backend
 *   - krun runner (auto-installed on Apple Silicon) — preferred backend
 *   - @earendil-works/gondolin installed in ~/.pi/agent/node_modules/
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  type BashOperations,
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  type EditOperations,
  type ReadOperations,
  type WriteOperations,
} from "@earendil-works/pi-coding-agent";

import {
  createShadowPathPredicate,
  RealFSProvider,
  ShadowProvider,
  type VirtualProvider,
  VM,
} from "@earendil-works/gondolin";

import { getBlockedCommandMessage } from "./uv.js";

const GUEST_WORKSPACE = "/workspace";
const GUEST_PI_DOCS = "/pi/docs";
const GUEST_PI_EXAMPLES = "/pi/examples";
const HOST_MODEL_CACHE = path.join(
  os.homedir(),
  "code",
  "github.com",
  "hrmnjt",
  "dev",
  "_models",
);

interface PiResources {
  docs: string;
  examples: string;
}

function moduleEntryToPath(entry: string): string {
  return entry.startsWith("file://") ? fileURLToPath(entry) : entry;
}

function resolvePackageRoot(specifier: string): string | null {
  const candidates: string[] = [];
  try {
    candidates.push(
      path.dirname(moduleEntryToPath(import.meta.resolve(specifier))),
    );
  } catch {
    // Ignore and try CommonJS resolution below.
  }
  try {
    candidates.push(path.dirname(require.resolve(specifier)));
  } catch {
    // Ignore and try package.json below for packages that expose it.
  }
  try {
    candidates.push(path.dirname(require.resolve(`${specifier}/package.json`)));
  } catch {
    // Package exports often hide package.json; walking from the entry covers that.
  }

  for (const start of candidates) {
    let dir = start;
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, "package.json"))) return dir;
      dir = path.dirname(dir);
    }
  }
  return null;
}

function resolvePiRootFromPath(startPath: string | undefined): string | null {
  if (!startPath) return null;
  let resolved: string;
  try {
    resolved = fs.realpathSync(startPath);
  } catch {
    resolved = startPath;
  }
  let dir =
    fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
      ? resolved
      : path.dirname(resolved);

  while (dir !== path.dirname(dir)) {
    const docs = path.join(dir, "docs");
    const examples = path.join(dir, "examples");
    if (fs.existsSync(docs) && fs.existsSync(examples)) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function resolvePiDocs(): PiResources | null {
  // Try the current @earendil-works scope first and keep the old @mariozechner
  // scope as a compatibility fallback. Then fall back to walking up from the pi
  // CLI entrypoint, which works when the extension loader aliases imports but
  // normal module resolution from ~/.pi/agent/extensions cannot see pi's package.
  const roots = [
    resolvePackageRoot("@earendil-works/pi-coding-agent"),
    resolvePackageRoot("@mariozechner/pi-coding-agent"),
    resolvePiRootFromPath(process.argv[1]),
  ];

  for (const root of roots) {
    if (!root) continue;
    const docs = path.join(root, "docs");
    const examples = path.join(root, "examples");
    if (fs.existsSync(docs) && fs.existsSync(examples))
      return { docs, examples };
  }
  return null;
}

function stripAtPrefix(value: string): string {
  return value.startsWith("@") ? value.slice(1) : value;
}

function toPosix(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}

function isInsideHostPath(root: string, value: string): boolean {
  const relativePath = path.relative(root, value);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function resolveWorkspaceShadowPaths(localCwd: string): string[] {
  if (!isInsideHostPath(localCwd, HOST_MODEL_CACHE)) return [];

  const relativePath = path.relative(localCwd, HOST_MODEL_CACHE);
  if (!relativePath) return [];
  return [`/${toPosix(relativePath)}`];
}

function hostPathToGuest(localCwd: string, hostPath: string): string {
  const relativePath = path.relative(localCwd, hostPath);
  return relativePath
    ? path.posix.join(GUEST_WORKSPACE, toPosix(relativePath))
    : GUEST_WORKSPACE;
}

function toGuestPath(localCwd: string, inputPath: string): string {
  const trimmed = stripAtPrefix(inputPath.trim());
  if (!trimmed) return GUEST_WORKSPACE;

  // The system prompt tells the model about /workspace and /pi, so the model
  // naturally uses these guest-absolute paths. Pass them through unchanged.
  if (
    trimmed === GUEST_WORKSPACE ||
    trimmed.startsWith(`${GUEST_WORKSPACE}/`)
  ) {
    return trimmed;
  }
  if (trimmed === "/pi" || trimmed.startsWith("/pi/")) {
    return trimmed;
  }

  // If a host-absolute path inside the original cwd reaches us, map it to the
  // mounted workspace. Other absolute paths are treated as guest paths; they can
  // only affect the VM filesystem unless separately mounted.
  if (path.isAbsolute(trimmed)) {
    if (isInsideHostPath(localCwd, trimmed))
      return hostPathToGuest(localCwd, trimmed);
    return path.posix.resolve("/", toPosix(trimmed));
  }

  return path.posix.resolve(GUEST_WORKSPACE, toPosix(trimmed));
}

// ---------------------------------------------------------------------------
// Git identity: resolve the correct user config from the host checkout.
// Inside the VM every repo appears as /workspace, so git's includeIf
// conditional can't distinguish personal from work repos by guest path.
// Linked worktrees may also live outside the normal source roots (Herdr uses
// ~/.herdr/worktrees by default), so use Git's common directory to find the
// primary repository before applying the path rules. Unknown paths remain
// fail-closed.
// ---------------------------------------------------------------------------

const GIT_IDENTITY_RULES: { root: string; config: string }[] = [
  {
    root: path.join(os.homedir(), "code", "work"),
    config: path.join(os.homedir(), ".config", "git", "config.work"),
  },
  {
    root: path.join(os.homedir(), "code", "github.com", "hrmnjt"),
    config: path.join(os.homedir(), ".config", "git", "config.personal"),
  },
];

function resolveGitCommonDir(localCwd: string): string | null {
  try {
    const commonDir = execFileSync(
      "git",
      [
        "-C",
        localCwd,
        "rev-parse",
        "--path-format=absolute",
        "--git-common-dir",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    return commonDir || null;
  } catch {
    return null;
  }
}

function resolveGitIdentityConfig(
  localCwd: string,
  gitCommonDir: string | null,
): string | null {
  // Non-git directories fall back to their own host path and remain fail-closed
  // unless that path is under an explicit identity root.
  const identitySourcePath = gitCommonDir ?? localCwd;
  const sorted = [...GIT_IDENTITY_RULES].sort(
    (a, b) => b.root.length - a.root.length,
  );
  for (const rule of sorted) {
    if (isInsideHostPath(rule.root, identitySourcePath)) {
      return rule.config;
    }
  }
  return null;
}

async function generateGitConfigDir(
  identityConfigPath: string | null,
): Promise<string> {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "pi-gitconfig-"),
  );

  // Git config for inside the VM. Includes identity unconditionally;
  // useConfigOnly=true ensures git refuses to commit when the identity
  // file is empty (i.e. no path rule matched — fail-closed).
  const configContent =
    [
      `[init]`,
      `    defaultBranch = main`,
      ``,
      `[core]`,
      `    excludesFile = ~/.config/git/ignore`,
      ``,
      `[user]`,
      `    useConfigOnly = true`,
      ``,
      `[include]`,
      `    path = ~/.config/git/identity`,
      ``,
      `[branch]`,
      `    sort = -committerdate`,
      ``,
      `[rerere]`,
      `    enabled = true`,
      ``,
      `[merge]`,
      `    conflictStyle = zdiff3`,
    ].join("\n") + "\n";

  await fs.promises.writeFile(path.join(tmpDir, "config"), configContent);

  // Identity: copy from the matched host config, or leave empty so
  // useConfigOnly rejects commits (fail-closed for unknown paths).
  const identityPath = path.join(tmpDir, "identity");
  if (identityConfigPath && fs.existsSync(identityConfigPath)) {
    const identityContent = await fs.promises.readFile(
      identityConfigPath,
      "utf8",
    );
    await fs.promises.writeFile(identityPath, identityContent);
  } else {
    await fs.promises.writeFile(
      identityPath,
      "# No matching git identity for this path — commits will fail\n",
    );
  }

  // Copy global gitignore from host
  const hostIgnore = path.join(os.homedir(), ".config", "git", "ignore");
  if (fs.existsSync(hostIgnore)) {
    await fs.promises.copyFile(hostIgnore, path.join(tmpDir, "ignore"));
  }

  return tmpDir;
}

function createGondolinReadOps(vm: VM, localCwd: string): ReadOperations {
  return {
    readFile: (p) => vm.fs.readFile(toGuestPath(localCwd, p)),
    access: async (p) => {
      await vm.fs.access(toGuestPath(localCwd, p));
    },
    detectImageMimeType: async (p) => {
      const ext = path.posix.extname(toGuestPath(localCwd, p)).toLowerCase();
      if (ext === ".png") return "image/png";
      if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
      if (ext === ".gif") return "image/gif";
      if (ext === ".webp") return "image/webp";
      return null;
    },
  };
}

function createGondolinWriteOps(vm: VM, localCwd: string): WriteOperations {
  return {
    writeFile: async (p, content) => {
      const guestPath = toGuestPath(localCwd, p);
      await vm.fs.mkdir(path.posix.dirname(guestPath), { recursive: true });
      await vm.fs.writeFile(guestPath, content, { encoding: "utf8" });
    },
    mkdir: (dir) =>
      vm.fs.mkdir(toGuestPath(localCwd, dir), { recursive: true }),
  };
}

function createGondolinEditOps(vm: VM, localCwd: string): EditOperations {
  const r = createGondolinReadOps(vm, localCwd);
  const w = createGondolinWriteOps(vm, localCwd);
  return { readFile: r.readFile, access: r.access, writeFile: w.writeFile };
}

function sanitizeEnv(
  env?: NodeJS.ProcessEnv,
): Record<string, string> | undefined {
  if (!env) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function createGondolinBashOps(
  vm: VM,
  localCwd: string,
  shellPath: string,
): BashOperations {
  return {
    exec: async (command, cwd, { onData, signal, timeout, env }) => {
      if (signal?.aborted) throw new Error("aborted");
      const guestCwd = toGuestPath(localCwd, cwd);

      // The VM inherits host env vars (HOME=/Users/..., XDG_CONFIG_HOME, etc.)
      // which don't exist inside the guest. Fix them so git and other tools
      // resolve config paths correctly inside the VM.
      const guestEnv: Record<string, string> = sanitizeEnv(env) ?? {};
      guestEnv["HOME"] = "/root";
      guestEnv["XDG_CONFIG_HOME"] = "/root/.config";
      // Suppress SSH host-key prompts when git connects through Gondolin's
      // SSH proxy (the proxy uses an ephemeral host key).
      guestEnv["GIT_SSH_COMMAND"] =
        "ssh -o BatchMode=yes -o StrictHostKeyChecking=no" +
        " -o UserKnownHostsFile=/dev/null -o GlobalKnownHostsFile=/dev/null" +
        " -o LogLevel=ERROR";

      const ac = new AbortController();
      const onAbort = () => ac.abort();
      signal?.addEventListener("abort", onAbort, { once: true });

      let timedOut = false;
      const timer =
        timeout && timeout > 0
          ? setTimeout(() => {
              timedOut = true;
              ac.abort();
            }, timeout * 1000)
          : undefined;

      try {
        const proc = vm.exec([shellPath, "-lc", command], {
          cwd: guestCwd,
          signal: ac.signal,
          env: guestEnv,
          stdout: "pipe",
          stderr: "pipe",
        });

        for await (const chunk of proc.output()) {
          onData(chunk.data);
        }

        const r = await proc;
        return { exitCode: r.exitCode };
      } catch (err) {
        if (signal?.aborted) throw new Error("aborted");
        if (timedOut) throw new Error(`timeout:${timeout}`);
        throw err;
      } finally {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

export default function (pi: ExtensionAPI) {
  const localCwd = process.cwd();
  const gitCommonDir = resolveGitCommonDir(localCwd);
  const workspaceShadowPaths = resolveWorkspaceShadowPaths(localCwd);
  const guestWorkspaceExclusions = workspaceShadowPaths.map((shadowPath) =>
    path.posix.join(GUEST_WORKSPACE, shadowPath),
  );

  const localRead = createReadTool(localCwd);
  const localWrite = createWriteTool(localCwd);
  const localEdit = createEditTool(localCwd);
  const localBash = createBashTool(localCwd);

  let vm: VM | null = null;
  let vmStarting: Promise<VM> | null = null;
  let piResources: PiResources | null = null;
  let gitConfigDir: string | null = null;
  let shellPath = "/bin/sh";

  async function cleanupGitConfigDir() {
    if (!gitConfigDir) return;
    try {
      await fs.promises.rm(gitConfigDir, { recursive: true, force: true });
    } catch {
      // best effort
    } finally {
      gitConfigDir = null;
    }
  }

  async function startVm(ctx?: ExtensionContext): Promise<VM> {
    if (ctx?.hasUI) {
      ctx.ui.setStatus(
        "gondolin",
        ctx.ui.theme.fg("accent", `Gondolin: starting ${GUEST_WORKSPACE}`),
      );
    }

    // Use krun (Apple Virtualization.framework) on Apple Silicon for faster boots.
    // Falls back to QEMU automatically if krun is unavailable.
    if (process.platform === "darwin" && process.arch === "arm64") {
      process.env.GONDOLIN_VMM = "krun";
    }

    // Detect pi docs/examples from the host installation.
    piResources = resolvePiDocs();

    // Keep the dev repository's model cache outside the guest without applying
    // the same _models convention to unrelated workspaces. ShadowProvider omits
    // it from listings, returns ENOENT for reads, and denies writes.
    const realWorkspaceProvider = new RealFSProvider(localCwd);
    const workspaceProvider: VirtualProvider =
      workspaceShadowPaths.length > 0
        ? new ShadowProvider(realWorkspaceProvider, {
            shouldShadow: createShadowPathPredicate(workspaceShadowPaths),
            writeMode: "deny",
          })
        : realWorkspaceProvider;
    const mounts: Record<string, VirtualProvider> = {
      [GUEST_WORKSPACE]: workspaceProvider,
    };

    // A linked worktree's .git file points to an absolute path under the
    // primary repository's common Git directory. Preserve that path inside the
    // guest so Git can read and update the shared refs and worktree metadata.
    if (gitCommonDir && !isInsideHostPath(localCwd, gitCommonDir)) {
      mounts[toPosix(gitCommonDir)] = new RealFSProvider(gitCommonDir);
    }

    if (piResources) {
      mounts[GUEST_PI_DOCS] = new RealFSProvider(piResources.docs);
      mounts[GUEST_PI_EXAMPLES] = new RealFSProvider(piResources.examples);
    }

    // Support custom VM images (e.g. with git pre-installed).
    // Set GONDOLIN_GUEST_DIR to the output of `just gondolin-image`.
    // Falls back to the default alpine-base image if unset.
    const imagePath = process.env.GONDOLIN_GUEST_DIR || undefined;

    // Generate a VM-specific git config directory that selects the correct
    // identity from the host checkout's primary repository (since all repos
    // appear as /workspace inside the VM, git's includeIf cannot distinguish
    // them by guest path).
    const identityConfigPath = resolveGitIdentityConfig(
      localCwd,
      gitCommonDir,
    );
    gitConfigDir = await generateGitConfigDir(identityConfigPath);
    mounts["/root/.config/git"] = new RealFSProvider(gitConfigDir);

    try {
      const created = await VM.create({
        sessionLabel: `pi ${path.basename(localCwd)}`,
        // Enable outbound SSH for git push/pull over SSH.
        // Requires synthetic DNS with per-host mapping so the proxy can
        // identify the intended upstream target from the guest's TCP connection.
        dns: { mode: "synthetic", syntheticHostMapping: "per-host" },
        ssh: {
          allowedHosts: ["github.com"],
          agent: process.env.SSH_AUTH_SOCK,
        },
        vfs: {
          mounts,
        },
        ...(imagePath ? { sandbox: { imagePath } } : {}),
      });

      const bashProbe = await created.exec([
        "/bin/sh",
        "-lc",
        "command -v bash || true",
      ]);
      shellPath = bashProbe.stdout.trim() || "/bin/sh";

      // Allow git to trust the workspace (repo files owned by host user,
      // but the VM runs as root — git rejects this by default). This is best
      // effort so the extension can still boot with the default git-less image.
      await created.exec(
        [
          "/bin/sh",
          "-lc",
          "command -v git >/dev/null 2>&1 && git config --global --add safe.directory /workspace || true",
        ],
        { env: { HOME: "/root" } },
      );

      vm = created;

      const identityLabel = identityConfigPath
        ? path.basename(identityConfigPath) === "config.work"
          ? "work"
          : "personal"
        : "none";
      if (ctx?.hasUI) {
        ctx.ui.setStatus(
          "gondolin",
          ctx.ui.theme.fg(
            "accent",
            `Gondolin: ${created.id.slice(0, 8)} (${GUEST_WORKSPACE})`,
          ),
        );
        const exclusionsLabel =
          guestWorkspaceExclusions.length > 0
            ? guestWorkspaceExclusions.join(", ")
            : "none";
        ctx.ui.notify(
          `Gondolin VM ready. Host ${localCwd} mounted at ${GUEST_WORKSPACE} (exclusions: ${exclusionsLabel}; git: ${identityLabel})`,
          "info",
        );
      }
      return created;
    } catch (error) {
      await cleanupGitConfigDir();
      if (ctx?.hasUI) ctx.ui.setStatus("gondolin", undefined);
      throw error;
    }
  }

  async function ensureVm(ctx?: ExtensionContext): Promise<VM> {
    if (vm) return vm;
    if (!vmStarting) {
      vmStarting = startVm(ctx).finally(() => {
        vmStarting = null;
      });
    }
    return vmStarting;
  }

  pi.on("session_start", async (_event, ctx) => {
    await ensureVm(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const activeVm = vm;
    vm = null;
    vmStarting = null;
    piResources = null;
    if (activeVm && ctx.hasUI) {
      ctx.ui.setStatus(
        "gondolin",
        ctx.ui.theme.fg("muted", "Gondolin: stopping"),
      );
    }
    try {
      if (activeVm) await activeVm.close();
    } finally {
      await cleanupGitConfigDir();
      if (ctx.hasUI) ctx.ui.setStatus("gondolin", undefined);
    }
  });

  pi.registerCommand("gondolin", {
    description: "Show Gondolin VM status",
    handler: async (_args, ctx) => {
      const activeVm = await ensureVm(ctx);
      if (!ctx.hasUI) return;
      ctx.ui.notify(
        [
          `Gondolin VM: ${activeVm.id}`,
          `Host workspace: ${localCwd}`,
          `Guest workspace: ${GUEST_WORKSPACE}`,
          `Workspace exclusions: ${guestWorkspaceExclusions.join(", ") || "none"}`,
          `Shell: ${shellPath}`,
          `Pi docs: ${piResources ? GUEST_PI_DOCS : "not mounted"}`,
          `Pi examples: ${piResources ? GUEST_PI_EXAMPLES : "not mounted"}`,
        ].join("\n"),
        "info",
      );
    },
  });

  pi.registerTool({
    ...localRead,
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx);
      const tool = createReadTool(GUEST_WORKSPACE, {
        operations: createGondolinReadOps(activeVm, localCwd),
      });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localWrite,
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx);
      const tool = createWriteTool(GUEST_WORKSPACE, {
        operations: createGondolinWriteOps(activeVm, localCwd),
      });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localEdit,
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx);
      const tool = createEditTool(GUEST_WORKSPACE, {
        operations: createGondolinEditOps(activeVm, localCwd),
      });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localBash,
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx);
      const tool = createBashTool(GUEST_WORKSPACE, {
        operations: createGondolinBashOps(activeVm, localCwd, shellPath),
        spawnHook: (spawnCtx) => {
          const blockedMessage = getBlockedCommandMessage(spawnCtx.command);
          if (blockedMessage) {
            throw new Error(blockedMessage);
          }
          return spawnCtx;
        },
      });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  // Intentionally do not override the `user_bash` event.
  // User-entered `!`/`!!` commands run on the host via pi's default handling,
  // while model-invoked bash tool calls stay sandboxed in Gondolin above.

  pi.on("before_agent_start", async (event, ctx) => {
    await ensureVm(ctx);
    let modified = event.systemPrompt.replace(
      `Current working directory: ${localCwd}`,
      `Current working directory: ${GUEST_WORKSPACE} (Gondolin VM, mounted from host: ${localCwd})`,
    );

    if (piResources) {
      modified += `\n\nPi documentation and examples are mounted in this VM:\n`;
      modified += `- ${GUEST_PI_DOCS}/ — API documentation (extensions.md, tui.md, skills.md, themes.md, etc.)\n`;
      modified += `- ${GUEST_PI_EXAMPLES}/ — working extension examples\n`;
      modified += `Reference these when asked to build or modify pi extensions, themes, or skills.`;
    }

    return { systemPrompt: modified };
  });
}

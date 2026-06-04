/**
 * Gondolin Sandbox Extension for pi
 *
 * Overrides pi's built-in read/write/edit/bash/ls/find/grep tools so they
 * execute inside a Gondolin micro-VM instead of on the host.
 *
 * The directory you start pi in is mounted read-write at /workspace
 * inside the VM.
 *
 * Based on pi's official Gondolin extension example, with local customizations:
 *   - custom VM image support via GONDOLIN_GUEST_DIR
 *   - krun auto-selection on Apple Silicon
 *   - Git over SSH via Gondolin's SSH bridge
 *   - host-path-based git identity selection
 *   - pi docs/examples mounted at /pi/docs and /pi/examples
 *   - user-entered !/!! commands intentionally remain host-side
 *
 * Requirements:
 *   - QEMU installed (brew install qemu) — fallback backend
 *   - krun runner (auto-installed on Apple Silicon) — preferred backend
 *   - @earendil-works/gondolin installed in ~/.pi/agent/node_modules/
 */

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
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  DEFAULT_MAX_BYTES,
  type EditOperations,
  type FindOperations,
  formatSize,
  type GrepToolDetails,
  type GrepToolInput,
  type LsOperations,
  type ReadOperations,
  truncateHead,
  truncateLine,
  type WriteOperations,
} from "@earendil-works/pi-coding-agent";

import { RealFSProvider, VM } from "@earendil-works/gondolin";

import { getBlockedCommandMessage } from "./uv.js";

const GUEST_WORKSPACE = "/workspace";
const GUEST_PI_DOCS = "/pi/docs";
const GUEST_PI_EXAMPLES = "/pi/examples";
const DEFAULT_GREP_LIMIT = 100;

interface PiResources {
  docs: string;
  examples: string;
}

type TextToolResult<TDetails> = {
  content: Array<{ type: "text"; text: string }>;
  details: TDetails | undefined;
};

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
// Git identity: resolve the correct user config based on the host path.
// Inside the VM every repo appears as /workspace, so git's includeIf
// conditional can't distinguish personal from work repos by guest path.
// Instead we resolve identity from the HOST path (localCwd) and write
// a VM-specific git config directory that includes only the matching
// identity file.
// ---------------------------------------------------------------------------

const GIT_IDENTITY_RULES: { prefix: string; config: string }[] = [
  {
    prefix: path.join(os.homedir(), "code", "work") + path.sep,
    config: path.join(os.homedir(), ".config", "git", "config.work"),
  },
  {
    prefix: path.join(os.homedir(), "code", "github.com", "hrmnjt") + path.sep,
    config: path.join(os.homedir(), ".config", "git", "config.personal"),
  },
];

function resolveGitIdentityConfig(localCwd: string): string | null {
  // Sort by prefix length descending so more specific (longer) paths win
  const sorted = [...GIT_IDENTITY_RULES].sort(
    (a, b) => b.prefix.length - a.prefix.length,
  );
  for (const rule of sorted) {
    if (localCwd.startsWith(rule.prefix)) {
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

function createGondolinLsOps(vm: VM, localCwd: string): LsOperations {
  return {
    exists: async (p) => {
      try {
        await vm.fs.access(toGuestPath(localCwd, p));
        return true;
      } catch {
        return false;
      }
    },
    stat: (p) => vm.fs.stat(toGuestPath(localCwd, p)),
    readdir: (dir) => vm.fs.listDir(toGuestPath(localCwd, dir)),
  };
}

async function walkGuestFiles(
  vm: VM,
  root: string,
  visit: (guestPath: string, relativePath: string) => Promise<boolean>,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) throw new Error("Operation aborted");
  const stat = await vm.fs.stat(root, { signal });
  if (!stat.isDirectory()) return visit(root, path.posix.basename(root));

  const walkDirectory = async (
    dir: string,
    relativeDir: string,
  ): Promise<boolean> => {
    if (signal?.aborted) throw new Error("Operation aborted");
    const entries = await vm.fs.listDir(dir, { signal });
    for (const entry of entries) {
      if (entry === ".git" || entry === "node_modules") continue;
      const guestPath = path.posix.join(dir, entry);
      const relativePath = relativeDir
        ? path.posix.join(relativeDir, entry)
        : entry;
      let entryStat: Awaited<ReturnType<VM["fs"]["stat"]>>;
      try {
        entryStat = await vm.fs.stat(guestPath, { signal });
      } catch {
        continue;
      }
      if (entryStat.isDirectory()) {
        if (!(await walkDirectory(guestPath, relativePath))) return false;
      } else if (!(await visit(guestPath, relativePath))) {
        return false;
      }
    }
    return true;
  };

  return walkDirectory(root, "");
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    const next = pattern[i + 1];
    if (char === "*" && next === "*" && pattern[i + 2] === "/") {
      source += "(?:.*/)?";
      i += 2;
    } else if (char === "*" && next === "*") {
      source += ".*";
      i += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`);
}

function matchesGlob(value: string, pattern: string): boolean {
  const nativeMatchesGlob = (
    path.posix as unknown as {
      matchesGlob?: (path: string, pattern: string) => boolean;
    }
  ).matchesGlob;
  if (nativeMatchesGlob) return nativeMatchesGlob(value, pattern);
  return globToRegExp(pattern).test(value);
}

function matchesToolGlob(relativePath: string, pattern: string): boolean {
  const normalizedPattern = toPosix(pattern);
  if (normalizedPattern.includes("/")) {
    return (
      matchesGlob(relativePath, normalizedPattern) ||
      matchesGlob(relativePath, `**/${normalizedPattern}`)
    );
  }
  return matchesGlob(path.posix.basename(relativePath), normalizedPattern);
}

function createGondolinFindOps(vm: VM, localCwd: string): FindOperations {
  return {
    exists: async (p) => {
      try {
        await vm.fs.access(toGuestPath(localCwd, p));
        return true;
      } catch {
        return false;
      }
    },
    glob: async (pattern, cwd, options) => {
      const root = toGuestPath(localCwd, cwd);
      const results: string[] = [];
      await walkGuestFiles(vm, root, async (guestPath, relativePath) => {
        if (results.length >= options.limit) return false;
        if (matchesToolGlob(relativePath, pattern)) results.push(guestPath);
        return results.length < options.limit;
      });
      return results;
    },
  };
}

function createLineMatcher(
  pattern: string,
  literal: boolean | undefined,
  ignoreCase: boolean | undefined,
) {
  if (literal) {
    const needle = ignoreCase ? pattern.toLowerCase() : pattern;
    return (line: string) =>
      (ignoreCase ? line.toLowerCase() : line).includes(needle);
  }
  const regex = new RegExp(pattern, ignoreCase ? "i" : undefined);
  return (line: string) => regex.test(line);
}

function appendGrepBlock(params: {
  outputLines: string[];
  lines: string[];
  relativePath: string;
  lineIndex: number;
  contextLines: number;
}): boolean {
  let linesTruncated = false;
  const start =
    params.contextLines > 0
      ? Math.max(0, params.lineIndex - params.contextLines)
      : params.lineIndex;
  const end =
    params.contextLines > 0
      ? Math.min(
          params.lines.length - 1,
          params.lineIndex + params.contextLines,
        )
      : params.lineIndex;

  for (let index = start; index <= end; index++) {
    const rawLine = params.lines[index] ?? "";
    const { text, wasTruncated } = truncateLine(rawLine.replace(/\r/g, ""));
    if (wasTruncated) linesTruncated = true;
    const separator = index === params.lineIndex ? ":" : "-";
    params.outputLines.push(
      `${params.relativePath}${separator}${index + 1}${separator} ${text}`,
    );
  }
  return linesTruncated;
}

async function executeGondolinGrep(
  vm: VM,
  localCwd: string,
  params: GrepToolInput,
  signal?: AbortSignal,
): Promise<TextToolResult<GrepToolDetails>> {
  const root = toGuestPath(localCwd, params.path ?? ".");
  const rootStat = await vm.fs.stat(root, { signal });
  const rootIsDirectory = rootStat.isDirectory();
  const matcher = createLineMatcher(
    params.pattern,
    params.literal,
    params.ignoreCase,
  );
  const contextLines =
    params.context && params.context > 0 ? params.context : 0;
  const effectiveLimit = Math.max(1, params.limit ?? DEFAULT_GREP_LIMIT);
  const outputLines: string[] = [];
  const details: GrepToolDetails = {};
  let matchCount = 0;
  let matchLimitReached = false;
  let linesTruncated = false;

  await walkGuestFiles(
    vm,
    root,
    async (guestPath, relativePath) => {
      if (matchCount >= effectiveLimit) return false;
      if (params.glob && !matchesToolGlob(relativePath, params.glob))
        return true;
      let content: string;
      try {
        content = await vm.fs.readFile(guestPath, { encoding: "utf8", signal });
      } catch {
        return true;
      }
      const lines = content
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n");
      const displayPath = rootIsDirectory
        ? relativePath
        : path.posix.basename(guestPath);
      for (let index = 0; index < lines.length; index++) {
        if (signal?.aborted) throw new Error("Operation aborted");
        if (!matcher(lines[index] ?? "")) continue;
        matchCount++;
        if (
          appendGrepBlock({
            outputLines,
            lines,
            relativePath: displayPath,
            lineIndex: index,
            contextLines,
          })
        ) {
          linesTruncated = true;
        }
        if (matchCount >= effectiveLimit) {
          matchLimitReached = true;
          return false;
        }
      }
      return true;
    },
    signal,
  );

  if (matchCount === 0) {
    return {
      content: [{ type: "text", text: "No matches found" }],
      details: undefined,
    };
  }

  const rawOutput = outputLines.join("\n");
  const truncation = truncateHead(rawOutput, {
    maxLines: Number.MAX_SAFE_INTEGER,
  });
  const notices: string[] = [];
  let output = truncation.content;

  if (matchLimitReached) {
    details.matchLimitReached = effectiveLimit;
    notices.push(`${effectiveLimit} matches limit reached`);
  }
  if (linesTruncated) {
    details.linesTruncated = true;
    notices.push("long lines truncated");
  }
  if (truncation.truncated) {
    details.truncation = truncation;
    notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
  }
  if (notices.length > 0) output += `\n\n[${notices.join(". ")}]`;

  return {
    content: [{ type: "text", text: output }],
    details: Object.keys(details).length > 0 ? details : undefined,
  };
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

  const localRead = createReadTool(localCwd);
  const localWrite = createWriteTool(localCwd);
  const localEdit = createEditTool(localCwd);
  const localBash = createBashTool(localCwd);
  const localLs = createLsTool(localCwd);
  const localFind = createFindTool(localCwd);
  const localGrep = createGrepTool(localCwd);

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

    const mounts: Record<string, InstanceType<typeof RealFSProvider>> = {
      [GUEST_WORKSPACE]: new RealFSProvider(localCwd),
    };

    if (piResources) {
      mounts[GUEST_PI_DOCS] = new RealFSProvider(piResources.docs);
      mounts[GUEST_PI_EXAMPLES] = new RealFSProvider(piResources.examples);
    }

    // Support custom VM images (e.g. with git pre-installed).
    // Set GONDOLIN_GUEST_DIR to the output of `just gondolin-image`.
    // Falls back to the default alpine-base image if unset.
    const imagePath = process.env.GONDOLIN_GUEST_DIR || undefined;

    // Generate a VM-specific git config directory that selects the correct
    // identity based on the host path (since all repos appear as /workspace
    // inside the VM, git's includeIf can't distinguish them by guest path).
    const identityConfigPath = resolveGitIdentityConfig(localCwd);
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
        ctx.ui.notify(
          `Gondolin VM ready. Host ${localCwd} mounted at ${GUEST_WORKSPACE} (git: ${identityLabel})`,
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

  pi.registerTool({
    ...localLs,
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx);
      const tool = createLsTool(GUEST_WORKSPACE, {
        operations: createGondolinLsOps(activeVm, localCwd),
      });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localFind,
    async execute(id, params, signal, onUpdate, ctx) {
      const activeVm = await ensureVm(ctx);
      const tool = createFindTool(GUEST_WORKSPACE, {
        operations: createGondolinFindOps(activeVm, localCwd),
      });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localGrep,
    async execute(_id, params, signal, _onUpdate, ctx) {
      const activeVm = await ensureVm(ctx);
      return executeGondolinGrep(activeVm, localCwd, params, signal);
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

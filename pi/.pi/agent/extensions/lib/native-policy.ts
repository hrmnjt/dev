import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

/** Follow existing parents, but never mistake a dangling symlink for a missing path. */
export async function canonicalPath(target: string): Promise<string> {
  const absolute = path.resolve(target);
  try {
    await fs.lstat(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(await canonicalPath(parent), path.basename(absolute));
  }
  return fs.realpath(absolute);
}

function gitPath(cwd: string, flag: string): string | undefined {
  try {
    return execFileSync("/usr/bin/git", ["-C", cwd, "-c", "core.fsmonitor=false", "rev-parse", "--path-format=absolute", flag], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: safeShellEnv(process.env),
    }).trim() || undefined;
  } catch {
    // Non-Git launch directories are valid. No identity fallback is introduced.
    return undefined;
  }
}

export interface NativePolicy {
  cwd: string;
  root: string;
  scratch: string;
  gitMetadata: string[];
  allowWrite: string[];
  denyRead: string[];
  denyWrite: string[];
  assertRead(target: string): Promise<string>;
  assertWrite(target: string): Promise<string>;
}

export async function createNativePolicy(cwd: string, scratch: string, options: { modelCache?: string } = {}): Promise<NativePolicy> {
  // Match Gondolin's mount: use launch cwd, not an automatically widened Git root.
  const root = await fs.realpath(cwd);
  const realScratch = await fs.realpath(scratch);
  const expand = async (paths: string[]) => [...new Set(await Promise.all(paths.map(canonicalPath)))];
  const gitMetadata = await expand([gitPath(root, "--git-dir"), gitPath(root, "--git-common-dir")].filter((p): p is string => !!p));
  const allowWrite = [...new Set([root, realScratch, ...gitMetadata])];
  const cache = path.resolve(options.modelCache ?? path.join(os.homedir(), "code/github.com/hrmnjt/dev/_models"));
  // Retain the old workspace model-cache exclusion, not a global read blacklist.
  const denyRead = isInside(root, cache) && root !== cache ? await expand([cache]) : [];
  const marker = path.join(realScratch, ".pi-native-policy");
  const denyWrite = [...denyRead, marker];
  return {
    cwd: root, root, scratch: realScratch, gitMetadata, allowWrite, denyRead, denyWrite,
    async assertRead(target) {
      const canonical = await canonicalPath(target);
      if (denyRead.some(p => isInside(p, canonical))) throw new Error(`Native sandbox: read denied: ${target}`);
      return canonical;
    },
    async assertWrite(target) {
      const canonical = await canonicalPath(target);
      // File tools are for source edits; use bash Git commands for metadata updates.
      const gitTarget = path.relative(root, canonical).split(path.sep).includes(".git") || gitMetadata.some(p => isInside(p, canonical));
      if ((!isInside(root, canonical) && !isInside(realScratch, canonical)) || gitTarget || denyWrite.some(p => isInside(p, canonical))) {
        throw new Error(`Native sandbox: write denied: ${target}${gitTarget ? "; use Git commands through bash" : ""}`);
      }
      try {
        const stat = await fs.stat(canonical);
        if (stat.isFile() && stat.nlink !== 1) throw new Error(`Native sandbox: hard-linked file: ${target}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      return canonical;
    },
  };
}

/** A filesystem-only Seatbelt profile: no proxy or mandatory package/source locks. */
export function nativeProfile(policy: NativePolicy): string {
  const subpath = (p: string) => `(subpath ${JSON.stringify(p)})`;
  const literal = (p: string) => `(literal ${JSON.stringify(p)})`;
  return [
    "(version 1)", "(allow default)", "(deny file-write*)",
    `(allow file-write* ${policy.allowWrite.map(subpath).join(" ")} ${literal("/dev/null")})`,
    ...policy.denyRead.map(p => `(deny file-read* ${subpath(p)})`),
    ...policy.denyWrite.map(p => `(deny file-write* ${subpath(p)})`),
    // Keep the workspace/scratch roots and excluded cache from being swapped out.
    `(deny file-write-unlink ${[policy.root, policy.scratch, ...policy.denyRead].map(literal).join(" ")})`,
  ].join("\n");
}

/** Keep startup-code sanitization, but preserve credentials/proxies for normal CLI use. */
export function safeShellEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (/^(BASH_ENV|ENV|SHELLOPTS|BASHOPTS|NODE_OPTIONS|NODE_PATH|JAVA_TOOL_OPTIONS|GIT_DIR|GIT_COMMON_DIR|GIT_WORK_TREE)$/.test(key) || /^(BASH_FUNC_|DYLD_|LD_)/.test(key)) continue;
    safe[key] = value;
  }
  // Require an explicitly configured identity; never let Git invent a fallback.
  const count = Number(safe.GIT_CONFIG_COUNT ?? 0);
  if (!Number.isSafeInteger(count) || count < 0 || count > 1024) throw new Error("Invalid GIT_CONFIG_COUNT");
  return { ...safe, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", SHELL: "/bin/bash",
    GIT_CONFIG_COUNT: String(count + 1), [`GIT_CONFIG_KEY_${count}`]: "user.useConfigOnly", [`GIT_CONFIG_VALUE_${count}`]: "true" };
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

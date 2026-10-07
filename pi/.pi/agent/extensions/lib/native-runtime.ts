import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { createNativePolicy, isInside, nativeProfile, safeShellEnv, shellQuote, type NativePolicy } from "./native-policy.ts";

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
const MAX_FILE_BYTES = 64 * 1024 * 1024;

// Fixed helper program. Payloads go through stdin, never through eval or shell interpolation.
const FILE_HELPER = `
const fs = require('node:fs');
const [op, target] = process.argv.slice(1);
if (op === 'read' || op === 'head') {
  const fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > ${MAX_FILE_BYTES}) throw Error('Expected regular file <= 64 MiB');
    if (op === 'head') { const b = Buffer.alloc(16); const n = fs.readSync(fd, b); process.stdout.write(b.subarray(0, n)); }
    else process.stdout.write(fs.readFileSync(fd));
  } finally { fs.closeSync(fd); }
} else if (op === 'mkdir') {
  // Do not issue mkdir on an already-existing (possibly pinned) ancestor.
  const path = require('node:path'), missing = [];
  let parent = target;
  while (!fs.existsSync(parent)) { missing.unshift(parent); parent = path.dirname(parent); }
  if (!fs.statSync(parent).isDirectory()) throw Error('Parent is not a directory');
  for (const dir of missing) {
    try { fs.mkdirSync(dir); }
    catch (e) { if (e.code !== 'EEXIST' || !fs.statSync(dir).isDirectory()) throw e; }
  }
}
else if (op === 'access') fs.accessSync(target, fs.constants.R_OK);
else if (op === 'write') {
  const data = fs.readFileSync(0);
  const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o666);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw Error('Expected regular, non-hard-linked file');
    fs.ftruncateSync(fd, 0); fs.writeFileSync(fd, data);
  } finally { fs.closeSync(fd); }
} else throw Error('Unknown operation');
`;

export class NativeRuntime {
  private ready?: Promise<NativePolicy>;
  private policy?: NativePolicy;
  private scratch?: string;
  private stopped = false;
  private children = new Set<ChildProcess>();
  private outputs = new Set<string>();

  private cwd: string;
  private localBash: BashOperations;

  constructor(cwd: string, localBash: BashOperations) {
    this.cwd = cwd; this.localBash = localBash;
  }

  ensureReady(): Promise<NativePolicy> {
    if (this.stopped) return Promise.reject(new Error("Native sandbox has shut down; restart Pi."));
    return this.ready ??= this.initialize(); // A failure is sticky; never retry unsandboxed.
  }

  private async checkLauncher(): Promise<void> {
    await fs.access(SANDBOX_EXEC, constants.X_OK);
  }

  private async initialize(): Promise<NativePolicy> {
    if (process.platform !== "darwin") throw new Error("Native sandbox requires macOS; tool execution is blocked on this platform.");
    await this.checkLauncher();
    this.scratch = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "pi-native-")));
    await fs.chmod(this.scratch, 0o700);
    // Ownership marker; the profile pins both it and the scratch root.
    const sentinel = path.join(this.scratch, ".pi-native-policy");
    const markerContent = "Owned by Pi native sandbox\n";
    await fs.writeFile(sentinel, markerContent, { mode: 0o600 });
    const policy = await createNativePolicy(this.cwd, this.scratch);
    // Probe the existing marker deny rule: an arbitrary os.tmpdir() sibling
    // can be writable when TMPDIR is inside the launch directory. Use the real
    // session profile unchanged, and prove both permitted writes and denial.
    const script = `const fs=require('node:fs'); fs.writeFileSync(${JSON.stringify(path.join(policy.scratch, "probe"))},'ok'); try { fs.writeFileSync(${JSON.stringify(sentinel)},'bad'); process.exitCode=31; } catch(e) { if (!['EPERM','EACCES'].includes(e.code)) throw e; }`;
    let diagnostic = "";
    const result = await this.localBash.exec(await this.wrap(`${shellQuote(process.execPath)} -e ${shellQuote(script)}`, policy, process.env), policy.cwd, {
      onData: data => { diagnostic = (diagnostic + data.toString()).slice(-4096); }, timeout: 10, env: safeShellEnv(process.env),
    });
    if (result.exitCode !== 0 || await fs.readFile(sentinel, "utf8") !== markerContent || await fs.readFile(path.join(policy.scratch, "probe"), "utf8") !== "ok") throw new Error(`Native sandbox filesystem self-test failed; tools remain blocked.${diagnostic.trim() ? `\n${diagnostic.trim()}` : ""}`);
    this.policy = policy;
    return policy;
  }

  private async wrap(command: string, policy: NativePolicy, env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<string> {
    if (this.stopped || signal?.aborted) throw new Error("Native sandbox is unavailable or aborted.");
    const exports = {
      PATH: env.PATH ?? process.env.PATH ?? "/usr/bin:/bin", TMPDIR: policy.scratch, TMP: policy.scratch, TEMP: policy.scratch,
      XDG_CACHE_HOME: path.join(policy.scratch, "cache"), UV_CACHE_DIR: path.join(policy.scratch, "cache/uv"),
      npm_config_cache: path.join(policy.scratch, "cache/npm"), PYTHONDONTWRITEBYTECODE: "1",
    };
    const prefix = Object.entries(exports).map(([k, v]) => `export ${k}=${shellQuote(v)}`).join("; ");
    return [SANDBOX_EXEC, "-p", nativeProfile(policy), "/bin/bash", "--noprofile", "--norc", "-c", `${prefix};\n${command}`].map(shellQuote).join(" ");
  }

  async exec(command: string, cwd: string, options: Parameters<BashOperations["exec"]>[2]) {
    const policy = await this.ensureReady();
    const realCwd = await fs.realpath(cwd);
    if (!isInside(policy.root, realCwd)) throw new Error("Native sandbox: working directory is outside the launch directory.");
    const env = options.env ?? process.env;
    const wrapped = await this.wrap(command, policy, env, options.signal);
    return this.localBash.exec(wrapped, realCwd, { ...options, env: safeShellEnv(env) });
  }

  async file(op: "read" | "head" | "access" | "mkdir" | "write", target: string, signal?: AbortSignal, content?: string): Promise<Buffer> {
    const policy = await this.ensureReady();
    const canonical = op === "write" || op === "mkdir" ? await policy.assertWrite(target) : await policy.assertRead(target);
    const command = [process.execPath, "-e", FILE_HELPER, op, canonical].map(shellQuote).join(" ");
    const wrapped = await this.wrap(command, policy, process.env, signal);
    if (signal?.aborted || this.stopped) throw new Error("aborted");
    return new Promise((resolve, reject) => {
      const child = spawn("/bin/bash", ["--noprofile", "--norc", "-c", wrapped], {
        cwd: policy.cwd, env: safeShellEnv(process.env), detached: true, stdio: ["pipe", "pipe", "pipe"],
      });
      this.children.add(child);
      const buffers: Buffer[] = [];
      let size = 0, stderr = "", tooLarge = false;
      const kill = () => { if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ESRCH") child.kill("SIGKILL"); } } };
      const timer = setTimeout(kill, 30_000);
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", kill); this.children.delete(child); };
      signal?.addEventListener("abort", kill, { once: true });
      child.stdin.on("error", () => {}); // EPIPE is reported through the child's failure below.
      child.stdin.end(content ?? "");
      child.stdout.on("data", (data: Buffer) => {
        size += data.length;
        if (size > MAX_FILE_BYTES) { tooLarge = true; kill(); } else buffers.push(data);
      });
      child.stderr.on("data", (data: Buffer) => { stderr = (stderr + data.toString()).slice(-4096); });
      child.on("error", error => { cleanup(); reject(error); });
      child.on("close", code => {
        cleanup();
        if (signal?.aborted) reject(new Error("aborted"));
        else if (tooLarge) reject(new Error("Native file operation exceeded 64 MiB."));
        else if (code !== 0) reject(new Error(stderr.trim() || "Native file operation failed or timed out."));
        else resolve(Buffer.concat(buffers));
      });
    });
  }

  allowOutputFile(file: string): void {
    if (!this.policy) throw new Error("Native sandbox is unavailable.");
    // The SDK creates these paths in the parent's os.tmpdir(), not the child's scratch.
    if (path.dirname(file) !== path.resolve(os.tmpdir()) || !/^pi-bash-[a-f0-9]{16}\.log$/.test(path.basename(file))) throw new Error("Unexpected Pi overflow path.");
    this.outputs.add(file);
  }

  async dispose(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    for (const child of this.children) {
      if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e; } }
    }
    await this.ready?.catch(() => {});
    for (const file of this.outputs) await fs.rm(file, { force: true });
    if (this.scratch) await fs.rm(this.scratch, { recursive: true, force: true });
  }
}

export function imageMimeType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a/.test(bytes.toString("ascii", 0, 6))) return "image/gif";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.toString("ascii", 0, 2) === "BM") return "image/bmp";
  return null;
}

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before, test } from "node:test";

// Test-only source selection supports checking a host-applied patch before activation.
const extensions = process.env.PI_TEST_EXTENSIONS_ROOT ?? fileURLToPath(new URL("../../pi/.pi/agent/extensions/", import.meta.url));
const { canonicalPath, createNativePolicy, isInside, nativeProfile, safeShellEnv, shellQuote } = await import(pathToFileURL(path.join(extensions, "lib/native-policy.ts")).href);
const { imageMimeType, NativeRuntime } = await import(pathToFileURL(path.join(extensions, "lib/native-runtime.ts")).href);
const { getBlockedCommandMessage } = await import(pathToFileURL(path.join(extensions, "uv.ts")).href);
let base: string, workspace: string, scratch: string, policy: Awaited<ReturnType<typeof createNativePolicy>>;
before(async () => {
  base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "pi-policy-test-")));
  workspace = path.join(base, "workspace"); scratch = path.join(base, "scratch");
  for (const p of [workspace, scratch]) await fs.mkdir(p);
  policy = await createNativePolicy(workspace, scratch);
});
after(async () => { await fs.rm(base, { recursive: true, force: true }); });

test("containment is not a string prefix", () => {
  assert.equal(isInside(workspace, `${workspace}-other/file`), false);
  assert.equal(isInside(workspace, path.join(workspace, "file")), true);
});
test("ordinary files and nonexistent parents stay inside the launch directory", async () => {
  const file = path.join(workspace, "new/deep/file.txt");
  assert.equal(await policy.assertWrite(file), file);
  assert.equal(await policy.assertWrite(path.join(scratch, "artifact")), path.join(scratch, "artifact"));
  await assert.rejects(policy.assertWrite(path.join(workspace, "../outside/new/file")), /write denied/);
});
test("symlinks, new parents beneath links, and dangling links fail closed", async () => {
  await fs.symlink(base, path.join(workspace, "escape"));
  await assert.rejects(policy.assertWrite(path.join(workspace, "escape/new/file")), /write denied/);
  await fs.symlink(path.join(base, "does-not-exist"), path.join(workspace, "dangling"));
  await assert.rejects(canonicalPath(path.join(workspace, "dangling/new/file")), { code: "ENOENT" });
  await fs.symlink(scratch, path.join(workspace, "scratch-link"));
  assert.equal(await policy.assertWrite(path.join(workspace, "scratch-link/file")), path.join(scratch, "file"));
});
test("Pi source is editable; direct Git metadata edits use bash Git commands instead", async () => {
  for (const p of [".pi/settings.json", "nested/.pi/extensions/new.ts", "pi/.pi/agent/extensions/sandbox.ts", "pi/.pi/agent/extensions/lib/native-policy.ts", "pi/.pi/agent/extensions/lib/native-runtime.ts"]) {
    assert.equal(await policy.assertWrite(path.join(workspace, p)), path.join(workspace, p));
  }
  for (const p of [".git/config", ".git", "nested/.git/HEAD"]) {
    await assert.rejects(policy.assertWrite(path.join(workspace, p)), /use Git commands through bash/);
  }
  await assert.rejects(policy.assertWrite(path.join(scratch, ".pi-native-policy")), /write denied/);
});
test("ordinary host reads remain available; only an in-workspace model cache is excluded", async () => {
  const readable = path.join(base, "outside-readable"); await fs.writeFile(readable, "readable");
  assert.equal(await policy.assertRead(readable), readable);
  const cache = path.join(workspace, "_models"); await fs.mkdir(cache);
  const cachePolicy = await createNativePolicy(workspace, scratch, { modelCache: cache });
  await assert.rejects(cachePolicy.assertRead(path.join(cache, "model.gguf")), /read denied/);
  await assert.rejects(cachePolicy.assertWrite(path.join(cache, "model.gguf")), /write denied/);
  const other = await createNativePolicy(scratch, workspace, { modelCache: cache });
  assert.deepEqual(other.denyRead, []);
});
test("existing hard-linked mutation targets are rejected", async () => {
  const file = path.join(base, "hardlink-original"); await fs.writeFile(file, "original");
  await fs.link(file, path.join(workspace, "hardlink"));
  await assert.rejects(policy.assertWrite(path.join(workspace, "hardlink")), /hard-linked/);
});
test("launch subdirectories stay narrow; linked Git metadata is a bash-only write exception", async () => {
  const primary = path.join(base, "primary"), linked = path.join(base, "linked");
  await fs.mkdir(primary); await fs.mkdir(path.join(primary, "src"));
  const git = (args: string[]) => execFileSync("/usr/bin/git", ["-c", "core.hooksPath=/dev/null", "-C", primary, ...args], { stdio: "ignore" });
  git(["init"]);
  git(["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", "-c", "user.name=Test fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "fixture"]);
  git(["worktree", "add", "-b", "fixture-linked", linked]);
  for (const cwd of [linked, path.join(primary, "src")]) {
    const p = await createNativePolicy(cwd, scratch);
    assert.equal(p.root, cwd);
    assert.ok(p.allowWrite.includes(path.join(primary, ".git")));
    await assert.rejects(p.assertWrite(path.join(primary, "outside.txt")), /write denied/);
    await assert.rejects(p.assertWrite(path.join(primary, ".git/HEAD")), /use Git commands through bash/);
  }
});
test("literal policy paths safely quote spaces, wildcards, quotes, and newlines", async () => {
  const odd = path.join(base, "work[tree] 'quoted'\nnew line"); await fs.mkdir(odd);
  const p = await createNativePolicy(odd, scratch);
  assert.ok(nativeProfile(p).includes(`(subpath ${JSON.stringify(odd)})`));
  assert.doesNotMatch(nativeProfile(p), /deny network|\.git\/hooks|\.zshrc/);
});
test("outer shell strips startup code but retains CLI auth, SSH agent, proxies and explicit Git identity", () => {
  const env = safeShellEnv({ PATH: "/evil", BASH_ENV: "/evil/startup", ENV: "evil", "BASH_FUNC_env%%": "evil", DYLD_INSERT_LIBRARIES: "evil", NODE_OPTIONS: "evil", GH_TOKEN: "fixture-token", SSH_AUTH_SOCK: "/fixture/socket", HTTPS_PROXY: "http://fixture.invalid", GIT_DIR: "/wrong/repo", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.autocrlf", GIT_CONFIG_VALUE_0: "false" });
  assert.equal(env.PATH, "/usr/bin:/bin:/usr/sbin:/sbin");
  for (const key of ["BASH_ENV", "ENV", "BASH_FUNC_env%%", "DYLD_INSERT_LIBRARIES", "NODE_OPTIONS", "GIT_DIR"]) assert.equal(env[key], undefined);
  assert.equal(env.GH_TOKEN, "fixture-token"); assert.equal(env.SSH_AUTH_SOCK, "/fixture/socket");
  assert.equal(env.HTTPS_PROXY, "http://fixture.invalid");
  assert.equal(env.GIT_CONFIG_COUNT, "2"); assert.equal(env.GIT_CONFIG_KEY_0, "core.autocrlf");
  assert.equal(env.GIT_CONFIG_KEY_1, "user.useConfigOnly"); assert.equal(env.GIT_CONFIG_VALUE_1, "true");
  const value = "quotes' and ! $(touch /nope)\nnew line";
  assert.equal(execFileSync("/bin/bash", ["-c", `printf %s ${shellQuote(value)}`], { encoding: "utf8" }), value);
});
test("uv rules stay shared and preserve supported commands", () => {
  for (const cmd of ["pip install x", ".venv/bin/pip3 install x", "echo ok && poetry add x", "python -m pip install x", "python3 -mvenv v", "python -m py_compile x.py"]) assert.ok(getBlockedCommandMessage(cmd), cmd);
  for (const cmd of ["uv add x", "uv run python x.py", "uv venv", "uv pip list"]) assert.equal(getBlockedCommandMessage(cmd), null, cmd);
});
test("file image signatures preserve attachments", () => {
  assert.equal(imageMimeType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "image/png");
  assert.equal(imageMimeType(Buffer.from("GIF89a")), "image/gif");
  assert.equal(imageMimeType(Buffer.from("ordinary text")), null);
});
test("filesystem startup self-test rejects a no-op executor and keeps that failure sticky", async () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const launcher = NativeRuntime.prototype.checkLauncher;
  let calls = 0;
  const runtime = new NativeRuntime(workspace, { exec: async () => { calls++; return { exitCode: 0 }; } });
  try {
    Object.defineProperty(process, "platform", { value: "darwin" });
    NativeRuntime.prototype.checkLauncher = async () => {};
    await assert.rejects(runtime.ensureReady(), /ENOENT|self-test/);
    await assert.rejects(runtime.file("write", path.join(workspace, "never-written"), undefined, "bad"), /ENOENT|self-test/);
    assert.equal(calls, 1);
    await assert.rejects(fs.stat(path.join(workspace, "never-written")), { code: "ENOENT" });
  } finally {
    await runtime.dispose();
    NativeRuntime.prototype.checkLauncher = launcher;
    Object.defineProperty(process, "platform", platform);
  }
});
test("unsupported native platforms block all operations and retain a failed initialization", { skip: process.platform === "darwin" }, async () => {
  let calls = 0;
  const runtime = new NativeRuntime(workspace, { exec: async () => { calls++; return { exitCode: 0 }; } });
  for (const action of [() => runtime.ensureReady(), () => runtime.file("write", path.join(workspace, "never-written"), undefined, "bad"), () => runtime.exec("touch never-written", workspace, { onData: () => {} })]) await assert.rejects(action(), /requires macOS/);
  assert.equal(calls, 0);
  await runtime.dispose(); await runtime.dispose();
  await assert.rejects(runtime.ensureReady(), /shut down/);
});

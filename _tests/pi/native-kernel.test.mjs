import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import net from "node:net";

// Deliberate host-only trial. Every mutation target is created by this test.
// Do not count Linux skips or registry mocks as proof of macOS enforcement.
test("real macOS Seatbelt enforcement, file tools, overflow, and cleanup", { skip: process.platform !== "darwin" }, async () => {
  const sdk = process.env.PI_TEST_SDK_ROOT ?? "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent";
  const require = createRequire(path.join(sdk, "package.json"));
  const { createJiti } = require("jiti");
  const jiti = createJiti(import.meta.url, { alias: { "@earendil-works/pi-coding-agent": path.join(sdk, "dist/index.js") }, fsCache: false });
  const { createLocalBashOperations, createBashToolDefinition, createReadToolDefinition, createWriteToolDefinition, createEditToolDefinition } = await jiti.import(path.join(sdk, "dist/index.js"));
  const extensions = process.env.PI_TEST_EXTENSIONS_ROOT ?? fileURLToPath(new URL("../../pi/.pi/agent/extensions/", import.meta.url));
  const { NativeRuntime, imageMimeType } = await jiti.import(path.join(extensions, "lib/native-runtime.ts"));
  const { shellQuote: q } = await jiti.import(path.join(extensions, "lib/native-policy.ts"));
  const base = await fs.mkdtemp(path.join(process.cwd(), ".pi-native-test-"));
  const workspace = path.join(base, "workspace"), outside = path.join(base, "outside");
  await fs.mkdir(workspace); await fs.mkdir(outside);
  execFileSync("/usr/bin/git", ["-C", workspace, "init"], { stdio: "ignore" });
  const sentinel = path.join(outside, "sentinel"); await fs.writeFile(sentinel, "unchanged");
  const operations = createLocalBashOperations({ shellPath: "/bin/bash" });
  const runtime = new NativeRuntime(workspace, operations);
  const succeed = async (rt, label, command, cwd, options = {}) => {
    let output = "";
    const result = await rt.exec(command, cwd, {
      ...options, onData: data => { output = (output + data.toString()).slice(-8192); },
    });
    assert.equal(result.exitCode, 0, `${label} failed:\n${output || "(no command output)"}`);
  };
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "pi-native-test-outside-"));
  await fs.writeFile(path.join(temp, "private-temp"), "private temp");
  let scratch, overflow;
  const extraRuntimes = [], servers = [];
  try {
    const policy = await runtime.ensureReady(); scratch = policy.scratch;
    const readOps = {
      access: async p => { await runtime.file("access", p); },
      readFile: p => runtime.file("read", p),
      detectImageMimeType: async p => imageMimeType(await runtime.file("head", p)),
    };
    const read = createReadToolDefinition(workspace, { operations: readOps });
    const write = createWriteToolDefinition(workspace, { operations: {
      mkdir: async p => { await runtime.file("mkdir", p); },
      writeFile: async (p, content) => { await runtime.file("write", p, undefined, content); },
    } });
    const edit = createEditToolDefinition(workspace, { operations: {
      access: async p => { await policy.assertWrite(p); await readOps.access(p); },
      readFile: readOps.readFile,
      writeFile: async (p, content) => { await runtime.file("write", p, undefined, content); },
    } });
    const bash = createBashToolDefinition(workspace, { exposeSessionEnvironment: false, operations: { exec: (...args) => runtime.exec(...args) } });
    const call = (tool, params) => tool.execute("fixture", params, undefined, undefined);
    await call(write, { path: "root.txt", content: "before\n" });
    await call(write, { path: "new/deep/file.txt", content: "nested\n" });
    await call(edit, { path: "root.txt", edits: [{ oldText: "before", newText: "after" }] });
    assert.match((await call(read, { path: "root.txt" })).content[0].text, /after/);
    assert.equal(await fs.readFile(path.join(workspace, "new/deep/file.txt"), "utf8"), "nested\n");
    await assert.rejects(call(write, { path: sentinel, content: "bad" }), /denied/);
    await assert.rejects(call(edit, { path: sentinel, edits: [{ oldText: "unchanged", newText: "bad" }] }), /denied/);
    for (const command of [`printf bad > ${q(sentinel)}`, `rm -rf ${q(outside)}`]) {
      assert.notEqual((await runtime.exec(command, workspace, { onData: () => {} })).exitCode, 0);
      assert.equal(await fs.readFile(sentinel, "utf8"), "unchanged");
    }
    await fs.symlink(outside, path.join(workspace, "escape"));
    await assert.rejects(runtime.file("write", path.join(workspace, "escape/new/file"), undefined, "bad"), /denied/);
    assert.notEqual((await runtime.exec("mkdir -p escape/new; printf bad > escape/sentinel", workspace, { onData: () => {} })).exitCode, 0);
    assert.equal(await fs.readFile(sentinel, "utf8"), "unchanged");
    // Git commands work, including config, staging, commit, and hooks. File tools
    // still direct metadata changes through Git rather than hand-editing .git.
    await assert.rejects(runtime.file("write", path.join(workspace, ".git/config"), undefined, "bad"), /use Git commands through bash/);
    await call(write, { path: "pi/.pi/agent/extensions/sandbox.ts", content: "// editable configuration fixture\n" });
    await call(write, { path: "pi/.pi/agent/extensions/lib/native-policy.ts", content: "// policy fixture\n" });
    await call(write, { path: "pi/.pi/agent/extensions/lib/native-runtime.ts", content: "// runtime fixture\n" });
    await call(write, { path: ".pi/settings.json", content: "{}\n" });
    const noIdentity = "unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL EMAIL; GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 git commit --allow-empty -m no-fallback";
    assert.notEqual((await runtime.exec(noIdentity, workspace, { onData: () => {}, env: { ...process.env, GIT_CONFIG_COUNT: "0", GIT_CONFIG_PARAMETERS: undefined } })).exitCode, 0);
    await succeed(runtime, "Git staging and commit", "git config core.hooksPath /dev/null && git config fixture.native yes && git add . && git -c commit.gpgSign=false -c user.name='Test fixture' -c user.email=fixture@example.invalid commit -m fixture", workspace);
    assert.equal(execFileSync("/usr/bin/git", ["-C", workspace, "config", "fixture.native"], { encoding: "utf8" }).trim(), "yes");
    await fs.writeFile(path.join(workspace, "hook.sh"), "#!/bin/sh\nprintf hook-ran > hook-ran.txt\n", { mode: 0o700 });
    // A bare "pre-commit" name from core.hooksPath=. is searched through PATH.
    // Use the real metadata directory and an absolute path for hook execution.
    const hooks = path.join(workspace, ".git/hooks");
    await succeed(runtime, "Configure fixture hooks", `mkdir -p ${q(hooks)} && git config core.hooksPath ${q(hooks)}`, workspace);
    await succeed(runtime, "Copy executable hook", `cp hook.sh ${q(path.join(hooks, "pre-commit"))}`, workspace);
    await succeed(runtime, "Git hook execution", "git -c commit.gpgSign=false -c user.name='Test fixture' -c user.email=fixture@example.invalid commit --allow-empty -m hook-fixture", workspace);
    assert.equal(await fs.readFile(path.join(workspace, "hook-ran.txt"), "utf8"), "hook-ran");
    // Leave fixture hooks disabled before creating additional worktrees.
    execFileSync("/usr/bin/git", ["-C", workspace, "config", "core.hooksPath", "/dev/null"]);
    assert.notEqual((await runtime.exec(`mv ${q(scratch)} ${q(path.join(workspace, "moved-scratch"))}`, workspace, { onData: () => {} })).exitCode, 0);
    assert.equal(await fs.realpath(scratch), scratch);
    // Deterministic networking and SSH-agent-style socket tests, with no external
    // downloads, real keys, or pushes to the user's origin.
    for (const unix of [false, true]) {
      const server = net.createServer(socket => socket.end("native network ok")); servers.push(server);
      const socketPath = path.join(outside, "fixture-agent.sock");
      await new Promise((resolve, reject) => { server.once("error", reject); if (unix) server.listen(socketPath, resolve); else server.listen(0, "127.0.0.1", resolve); });
      const address = server.address();
      const target = unix ? "process.env.SSH_AUTH_SOCK" : `${address.port},'127.0.0.1'`;
      const network = `const net=require('node:net');const s=net.connect(${target});let data='';s.setTimeout(2000,()=>{s.destroy();process.exitCode=2;});s.on('error',()=>{process.exitCode=3;});s.on('data',b=>data+=b);s.on('end',()=>{process.exitCode=data==='native network ok'?0:4;});`;
      await succeed(runtime, unix ? "SSH-agent-style Unix socket" : "Loopback TCP", `${q(process.execPath)} -e ${q(network)}`, workspace, { timeout: 5, env: { ...process.env, SSH_AUTH_SOCK: socketPath } });
      await new Promise(resolve => server.close(resolve));
    }
    const big = await call(bash, { command: `${q(process.execPath)} -e ${q("process.stdout.write('overflow line\\n'.repeat(6000))")}`, timeout: 10 });
    overflow = big.details.fullOutputPath; assert.ok(overflow);
    runtime.allowOutputFile(overflow);
    assert.ok((await runtime.file("read", overflow)).includes(Buffer.from("overflow line")));
    assert.equal((await runtime.file("read", sentinel)).toString(), "unchanged");
    assert.equal((await runtime.file("read", path.join(temp, "private-temp"))).toString(), "private temp");
    await succeed(runtime, "Git status", "git status --short", workspace);
    await assert.rejects(runtime.exec("sleep 10", workspace, { onData: () => {}, timeout: 0.05 }), /timeout/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(runtime.file("read", path.join(workspace, "root.txt"), controller.signal), /abort/i);
    const png = path.join(workspace, "pixel.png");
    // Valid 1x1 RGBA PNG, including chunk CRCs; Pi's image decoder rejects the old fixture.
    const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=", "base64");
    await fs.writeFile(png, pngBytes);
    assert.deepEqual(await runtime.file("read", png), pngBytes);
    const imageResult = await call(read, { path: "pixel.png" });
    assert.ok(imageResult.content.some(c => c.type === "image" && c.mimeType === "image/png"),
      JSON.stringify(imageResult.content.map(({ type, text, mimeType }) => ({ type, text, mimeType }))));
    // Starting in a subdirectory must not widen writes to the Git root.
    const src = path.join(workspace, "src"); await fs.mkdir(src);
    const narrow = new NativeRuntime(src, operations); extraRuntimes.push(narrow);
    assert.equal((await narrow.ensureReady()).root, src);
    assert.notEqual((await narrow.exec("printf bad > ../root.txt", src, { onData: () => {} })).exitCode, 0);
    await assert.rejects(narrow.file("write", path.join(workspace, "root.txt"), undefined, "bad"), /denied/);
    await succeed(narrow, "Launch-subdirectory Git commit", "git -c commit.gpgSign=false -c user.name='Test fixture' -c user.email=fixture@example.invalid commit --allow-empty -m narrow-fixture", src);
    // Herdr-style linked worktrees may update only their own source and shared
    // Git metadata, not arbitrary files in the primary checkout.
    const linked = path.join(base, "linked");
    execFileSync("/usr/bin/git", ["-c", "core.hooksPath=/dev/null", "-C", workspace, "worktree", "add", "-b", "fixture-linked", linked], { stdio: "ignore" });
    const linkedRuntime = new NativeRuntime(linked, operations); extraRuntimes.push(linkedRuntime);
    await linkedRuntime.file("write", path.join(linked, "linked.txt"), undefined, "linked\n");
    await succeed(linkedRuntime, "Linked-worktree Git commit", "git add linked.txt && git -c commit.gpgSign=false -c user.name='Test fixture' -c user.email=fixture@example.invalid commit -m linked-fixture", linked);
    assert.notEqual((await linkedRuntime.exec(`printf bad > ${q(path.join(workspace, "root.txt"))}`, linked, { onData: () => {} })).exitCode, 0);
    assert.equal(await fs.readFile(path.join(workspace, "root.txt"), "utf8"), "after\n");
    // TMPDIR may be inside cwd, or cwd may be the temp root itself. The startup
    // denial probe must still fail to write under the unchanged session profile.
    const projectTemp = path.join(workspace, "project-temp"); await fs.mkdir(projectTemp);
    const previousTmpdir = process.env.TMPDIR;
    try {
      process.env.TMPDIR = projectTemp;
      for (const directory of [workspace, projectTemp]) {
        const localTempRuntime = new NativeRuntime(directory, operations); extraRuntimes.push(localTempRuntime);
        const p = await localTempRuntime.ensureReady();
        assert.equal(p.root, directory);
        assert.equal(path.dirname(p.scratch), projectTemp);
        const marker = path.join(p.scratch, ".pi-native-policy");
        const unchanged = await fs.readFile(marker, "utf8");
        assert.notEqual((await localTempRuntime.exec(`printf bad > ${q(marker)}`, directory, { onData: () => {} })).exitCode, 0);
        assert.equal(await fs.readFile(marker, "utf8"), unchanged);
        await succeed(localTempRuntime, "Local-TMPDIR workspace write", "printf ok > tmpdir-write.txt", directory);
        assert.equal(await fs.readFile(path.join(directory, "tmpdir-write.txt"), "utf8"), "ok");
        await localTempRuntime.dispose();
        await assert.rejects(fs.stat(p.scratch), { code: "ENOENT" });
      }
    } finally {
      if (previousTmpdir === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previousTmpdir;
    }
  } finally {
    for (const server of servers) if (server.listening) await new Promise(resolve => server.close(resolve));
    for (const extra of extraRuntimes) {
      const p = await extra.ensureReady().catch(() => null);
      await extra.dispose();
      if (p) await assert.rejects(fs.stat(p.scratch), { code: "ENOENT" });
    }
    await runtime.dispose();
    if (scratch) await assert.rejects(fs.stat(scratch), { code: "ENOENT" });
    if (overflow) await assert.rejects(fs.stat(overflow), { code: "ENOENT" });
    await fs.rm(base, { recursive: true, force: true });
    await fs.rm(temp, { recursive: true, force: true });
  }
});

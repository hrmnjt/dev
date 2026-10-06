import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
const sdk = process.env.PI_TEST_SDK_ROOT ?? "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent";
const require = createRequire(path.join(sdk, "package.json"));
const jiti = require("jiti").createJiti(import.meta.url, { fsCache: false, alias: {
  "@earendil-works/pi-coding-agent": path.join(sdk, "dist/index.js"),
} });
const { SessionManager } = await jiti.import(path.join(sdk, "dist/index.js"));
const base = fileURLToPath(new URL("../../pi/.pi/agent/extensions/", import.meta.url));
const extension = (await jiti.import(path.join(base, "review-summary.ts"))).default;
const { readReviewState, REVIEW_ENTRY } = await jiti.import(path.join(base, "lib/review-state.ts"));
const assistant = (reason = "stop") => ({ role: "assistant", stopReason: reason, content: [{type: "text", text: "Fixture review"}], timestamp: Date.now() });

async function fixture(t) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "pi-review-test-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  function git(args) {
    const r = spawnSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  }
  git(["init", "-b", "main"]); git(["commit", "--allow-empty", "-m", "base"]);
  git(["checkout", "-b", "feature"]); git(["commit", "--allow-empty", "-m", "one"]);
  const manager = SessionManager.inMemory(cwd);
  const messages = [], notices = [];
  const ctx = { cwd, sessionManager: manager, isIdle: () => true, ui: { notify: (message, level) => notices.push({message, level}) } };
  const api = {
    registerCommand: (_name, def) => { api.command = def.handler; },
    exec: async (_cmd, args, options) => {
      assert.equal(options.cwd, cwd);
      const r = spawnSync("git", args, { cwd: options.cwd, encoding: "utf8" });
      return { code: r.status, stdout: r.stdout, stderr: r.stderr };
    },
    appendEntry: (type, data) => manager.appendCustomEntry(type, data),
    sendUserMessage: message => { messages.push(message); manager.appendMessage({role: "user", content: message, timestamp: Date.now()}); },
  };
  extension(api);
  return { cwd, git, manager, messages, notices, ctx, api, run: args => api.command(args, ctx), request: () => manager.getBranch().filter(e => e.type === "custom" && e.customType === REVIEW_ENTRY).at(-1) };
}

test("unfinished requests do not advance; explicit completion survives factory reload", async t => {
  const f = await fixture(t);
  await f.run(""); const first = f.request();
  await f.run("");
  assert.match(f.messages.at(-1), /PR Review/);
  assert.match(f.messages.at(-1), new RegExp(`${first.data.scope.mergeBase}\\.\\.${first.data.head}`));
  await f.run("complete"); assert.match(f.notices.at(-1).message, /No successful final/);
  for (const reason of ["error", "aborted", "length", "toolUse"]) {
    f.manager.appendMessage(assistant(reason));
    await f.run("complete"); assert.match(f.notices.at(-1).message, /unfinished or failed/);
  }
  f.manager.appendMessage(assistant());
  await f.run("complete"); assert.equal(f.request().data.action, "completed");
  f.git(["commit", "--allow-empty", "-m", "two"]);
  extension(f.api); // Reload keeps no state in the factory.
  await f.run(""); assert.match(f.messages.at(-1), /Updated review/);
  assert.match(f.messages.at(-1), new RegExp(`${first.data.head}\\.\\.`));
});

test("completion checkpoints requested HEAD, not newer commits; reset allows a full rerun", async t => {
  const f = await fixture(t);
  await f.run(""); const requested = f.request().data.head;
  f.manager.appendMessage(assistant()); f.git(["commit", "--allow-empty", "-m", "two"]);
  await f.run("complete"); assert.equal(f.request().data.head, requested);
  await f.run(""); assert.match(f.messages.at(-1), /1 new commit/);
  f.manager.appendMessage(assistant()); await f.run("complete");
  const count = f.messages.length; await f.run(""); assert.equal(f.messages.length, count);
  await f.run("reset"); await f.run(""); assert.match(f.messages.at(-1), /PR Review/);
});

test("tree navigation and new sessions cannot inherit abandoned completion", async t => {
  const f = await fixture(t);
  const root = f.manager.appendMessage({ role: "user", content: "root", timestamp: Date.now() });
  await f.run(""); const scope = f.request().data.scope;
  f.manager.appendMessage(assistant()); await f.run("complete");
  assert.ok(readReviewState(f.manager.getBranch(), scope).completed);
  f.manager.branch(root); f.manager.appendMessage({ role: "user", content: "alternative", timestamp: Date.now() });
  assert.equal(readReviewState(f.manager.getBranch(), scope).completed, undefined);
  await f.run(""); assert.match(f.messages.at(-1), /PR Review/);
  f.ctx.sessionManager = SessionManager.inMemory(f.cwd);
  await f.run("complete"); assert.match(f.notices.at(-1).message, /No pending review/);
});

test("rewritten histories and changed Git branch/base never skip the full review", async t => {
  const f = await fixture(t);
  await f.run(""); f.manager.appendMessage(assistant()); await f.run("complete");
  f.git(["reset", "--hard", "main"]); f.git(["commit", "--allow-empty", "-m", "rewritten"]);
  await f.run(""); assert.match(f.messages.at(-1), /PR Review/);
  f.git(["checkout", "-b", "other"]); await f.run(""); assert.match(f.messages.at(-1), /PR Review/);
  f.git(["branch", "alternate-base", "main"]); await f.run("alternate-base"); assert.match(f.messages.at(-1), /PR Review/);
});

test("malformed/orphan completions are ignored and compaction preserves valid state", async t => {
  const f = await fixture(t); await f.run(""); const request = f.request();
  f.manager.appendCustomEntry(REVIEW_ENTRY, { ...request.data, action: "completed", requestId: "wrong" });
  assert.equal(readReviewState(f.manager.getBranch(), request.data.scope).completed, undefined);
  f.manager.appendCustomEntry(REVIEW_ENTRY, { ...request.data, version: 999 });
  f.manager.appendCustomEntry(REVIEW_ENTRY, { version: 1, scope: null });
  f.manager.appendMessage(assistant()); await f.run("complete");
  f.manager.appendCompaction("fixture summary", null, 1000);
  const restored = SessionManager.inMemory(f.cwd, {}, JSON.parse(JSON.stringify([f.manager.getHeader(), ...f.manager.getBranch()])));
  assert.equal(readReviewState(restored.getBranch(), request.data.scope).completed, request.data.head);
  for (const field of ["root", "gitDir", "branch", "base", "mergeBase"]) {
    const scope = { ...request.data.scope, [field]: field === "mergeBase" ? "a".repeat(40) : "different" };
    assert.equal(readReviewState(restored.getBranch(), scope).completed, undefined);
  }
});

test("Git failure, busy turn and session navigation during setup persist nothing", async t => {
  const f = await fixture(t); const original = f.api.exec;
  f.api.exec = async (...args) => args[1][0] === "diff" ? { code: 1, stderr: "Fixture diff failure" } : original(...args);
  await f.run(""); assert.equal(f.request(), undefined); assert.match(f.notices.at(-1).message, /Fixture diff failure/);
  f.api.exec = original; f.ctx.isIdle = () => false; await f.run(""); assert.equal(f.request(), undefined);
  f.ctx.isIdle = () => true;
  f.api.exec = async (...args) => {
    const r = await original(...args);
    if (args[1][0] === "log") f.manager.appendMessage({role: "user", content: "navigation", timestamp: Date.now()});
    return r;
  };
  await f.run(""); assert.equal(f.request(), undefined); assert.match(f.notices.at(-1).message, /Session branch changed/);
});

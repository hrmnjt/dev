import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
const sdk = process.env.PI_TEST_SDK_ROOT ?? "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent";
const require = createRequire(path.join(sdk, "package.json"));
const jiti = require("jiti").createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-tui": require.resolve("@earendil-works/pi-tui") } });
const extension = (await jiti.import(fileURLToPath(new URL("../../pi/.pi/agent/extensions/review.ts", import.meta.url)))).default;

function fixture(t, untracked = true, allowMessage = false) {
  const parent = mkdtempSync(path.join(tmpdir(), "review-command-test-")), root = path.join(parent, "repo"), scratch = path.join(parent, "scratch");
  mkdirSync(root); mkdirSync(scratch);
  const oldTmp = process.env.TMPDIR; process.env.TMPDIR = scratch;
  t.after(() => { if (oldTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = oldTmp; rmSync(parent, { recursive: true, force: true }); });
  const git = args => {
    const p = spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_OPTIONAL_LOCKS: "0" } });
    assert.equal(p.status, 0, p.stderr); return p.stdout.trimEnd();
  };
  git(["init", "-q", "-b", "main", "--template="]); writeFileSync(path.join(root, "tracked.txt"), "tracked\n"); git(["add", "."]);
  git(["-c", "user.name=Review fixture", "-c", "user.email=review@fixture.invalid", "commit", "-qm", "initial"]);
  if (untracked) writeFileSync(path.join(root, "new.txt"), "new review content\n");
  const realIndex = git(["rev-parse", "--path-format=absolute", "--git-path", "index"]), before = readFileSync(realIndex);
  const notifications = [], messages = [], events = new Map(); let handler, custom;
  extension({ on: (name, callback) => events.set(name, callback), registerCommand: (_name, opts) => { handler = opts.handler; }, sendUserMessage: message => { assert.ok(allowMessage, "No comments should be sent by this fixture"); messages.push(message); } });
  const tui = { terminal: { rows: 40, columns: 100, write() {} }, requestRender() {}, stop() {}, start() {} };
  const ctx = { mode: "tui", cwd: root, ui: { notify: (message, kind) => notifications.push({ message, kind }), custom: (...args) => custom(...args) } };
  return { parent, root, scratch, events, notifications, messages, ctx, handler, tui,
    custom: callback => { custom = callback; },
    assertClean: () => { assert.deepEqual(readFileSync(realIndex), before); assert.deepEqual(readdirSync(scratch), []); },
  };
}

for (const outcome of ["cancel", "shutdown", "ui-error"]) test(`TUI ${outcome} cleans the private index without changing the real index`, async t => {
  const f = fixture(t); f.custom(factory => {
    const component = factory(f.tui, undefined, undefined, () => {});
    assert.ok(component.files.some(file => file.displayPath === "new.txt"));
    component.dispose();
    if (outcome === "shutdown") { f.events.get("session_shutdown")(); assert.deepEqual(readdirSync(f.scratch), []); }
    if (outcome === "ui-error") throw new Error("fixture UI failure");
    return null;
  });
  await f.handler("--tui", f.ctx); f.assertClean();
  assert.ok(f.notifications.some(n => n.message.includes(outcome === "ui-error" ? "fixture UI failure" : "cancelled")));
});

test("submitted review context reports the real untracked status, not private intent-to-add staging", async t => {
  const f = fixture(t, true, true);
  f.custom(() => ({ target: { kind: "head" }, comments: [{ id: 1, filePath: "new.txt", body: "Please check this new file" }] }));
  await f.handler("--tui", f.ctx); f.assertClean();
  assert.equal(f.messages.length, 1); assert.match(f.messages[0], /\?\? new\.txt/);
  assert.doesNotMatch(f.messages[0], / A new\.txt/);
});

for (const target of ["--tui", "--tui --base missing-branch"]) test(`empty or invalid review (${target}) cleans up without opening UI`, async t => {
  const f = fixture(t, false); f.custom(() => assert.fail("UI should not open"));
  await f.handler(target, f.ctx); f.assertClean();
  assert.ok(f.notifications.some(n => n.message.includes(target.includes("missing") ? "missing-branch" : "No changes")));
});

for (const action of ["submit", "cancel", "error"]) test(`Neovim ${action} receives the private Git environment and cleanup follows`, async t => {
  const f = fixture(t), bin = path.join(f.parent, "bin"), trace = path.join(f.parent, "trace.json"); mkdirSync(bin);
  writeFileSync(path.join(bin, "nvim"), `#!/usr/bin/env node
const fs = require('node:fs'), cp = require('node:child_process');
const command = JSON.parse(process.env.PI_REVIEW_GIT_COMMAND);
const diff = cp.spawnSync(command[0], command.slice(1), {encoding:'utf8'});
fs.writeFileSync(process.env.REVIEW_TEST_TRACE, JSON.stringify({index:process.env.GIT_INDEX_FILE, optional:process.env.GIT_OPTIONAL_LOCKS, output:process.env.PI_REVIEW_OUTPUT_PATH, diff:diff.stdout, code:diff.status}));
fs.writeFileSync(process.env.PI_REVIEW_OUTPUT_PATH, JSON.stringify({protocol:1, action:process.env.REVIEW_TEST_ACTION, comments:[], message:'fixture editor error'}));
`, { mode: 0o755 });
  const old = { PATH: process.env.PATH, REVIEW_TEST_TRACE: process.env.REVIEW_TEST_TRACE, REVIEW_TEST_ACTION: process.env.REVIEW_TEST_ACTION };
  Object.assign(process.env, { PATH: `${bin}${path.delimiter}${old.PATH}`, REVIEW_TEST_TRACE: trace, REVIEW_TEST_ACTION: action });
  t.after(() => { for (const [key,value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  f.custom(factory => { let value; factory(f.tui, undefined, undefined, result => { value = result; }); return value; });
  // Don't send the real editor's screen-clear escape to the test terminal.
  const write = process.stdout.write;
  process.stdout.write = function(chunk, ...args) { if (chunk === "\x1b[2J\x1b[H") return true; return write.call(this, chunk, ...args); };
  try { await f.handler("", f.ctx); } finally { process.stdout.write = write; }
  const result = JSON.parse(readFileSync(trace, "utf8"));
  assert.equal(result.code, 0); assert.match(result.diff, /new review content/); assert.equal(result.optional, "0");
  assert.equal(existsSync(result.index), false); assert.equal(existsSync(result.output), false);
  f.assertClean();
  assert.ok(f.notifications.some(n => n.message.includes(action === "submit" ? "no comments" : action === "cancel" ? "cancelled" : "fixture editor error")));
});

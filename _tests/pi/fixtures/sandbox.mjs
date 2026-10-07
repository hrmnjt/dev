import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = process.env.PI_TEST_SDK_ROOT;
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const fixture = path.dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(import.meta.url, { alias: {
  "@earendil-works/pi-coding-agent": path.join(root, "dist/index.js"),
}, moduleCache: true, fsCache: false });
const tools = [], events = new Map(), commands = [];
const api = {
  registerTool: tool => tools.push(tool),
  registerCommand: name => commands.push(name),
  on: (name, handler) => { const handlers = events.get(name) ?? []; handlers.push(handler); events.set(name, handlers); },
};
const extensions = process.env.PI_TEST_EXTENSIONS_ROOT ?? path.resolve(fixture, "../../../pi/.pi/agent/extensions");
(await jiti.import(path.join(extensions, "sandbox.ts"), { default: true }))(api);
assert.deepEqual(tools.map(t => t.name), ["read", "write", "edit", "bash"]);
assert.deepEqual(commands, ["sandbox"]);
assert.equal(events.has("user_bash"), false);
// Isolated failure injection: never run actual macOS tools in registry tests.
const { NativeRuntime } = await jiti.import(path.join(extensions, "lib/native-runtime.ts"));
const launcherFailure = process.env.PI_TEST_FAILURE === "launcher";
if (launcherFailure) NativeRuntime.prototype.checkLauncher = async () => { throw new Error("fixture: native launcher missing"); };
else NativeRuntime.prototype.initialize = async () => { throw new Error("fixture: native initialization failed"); };
Object.defineProperty(process, "platform", { value: "darwin" });
let statusCalls = 0;
const ctx = { cwd: process.cwd(), hasUI: false, ui: { notify() {}, setStatus() { statusCalls++; } } };
const error = launcherFailure ? /fixture: native launcher missing/ : /fixture: native initialization failed/;
for (const tool of tools) await assert.rejects(tool.execute("fixture", {}, undefined, undefined, ctx), error);
// Direct and nested/codemode calls share this gate, without a host fallback.
for (const handler of events.get("tool_call")) await assert.rejects(handler({ toolName: "bash", input: { command: "touch never" } }, ctx), error);
// Ready-path dispatch without starting processes: uv and unsupported tools stay blocked.
NativeRuntime.prototype.ensureReady = async () => ({});
for (const handler of events.get("session_start")) await handler({}, { ...ctx, hasUI: true });
assert.equal(statusCalls, 0, "No sandbox footer status expected");
const bash = tools.find(t => t.name === "bash");
await assert.rejects(bash.execute("fixture", { command: "pip install fixture" }, undefined, undefined, ctx), /pip is disabled/);
for (const handler of events.get("tool_call")) {
  assert.equal((await handler({ toolName: "powershell", input: {} }, ctx)).block, true);
  assert.equal(await handler({ toolName: "tldraw_search", input: {} }, ctx), undefined);
}
for (const handler of events.get("session_shutdown")) await handler({}, ctx);
console.log(JSON.stringify({ tools: tools.map(t => t.name), commands }));

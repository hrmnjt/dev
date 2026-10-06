import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
const sdk = process.env.PI_TEST_SDK_ROOT ?? "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent";
const require = createRequire(path.join(sdk, "package.json"));
const jiti = require("jiti").createJiti(import.meta.url, { fsCache: false, alias: {
  "@earendil-works/pi-coding-agent": path.join(sdk, "dist/index.js"),
  "@earendil-works/pi-tui": path.join(sdk, "node_modules/@earendil-works/pi-tui/dist/index.js"),
} });
const base = fileURLToPath(new URL("../../pi/.pi/agent/extensions/", import.meta.url));
const { default: extension, parseExtractionResult, extractQuestions, QnAComponent } = await jiti.import(path.join(base, "answer.ts"));
const { SessionManager, initTheme } = await jiti.import(path.join(sdk, "dist/index.js"));
initTheme("dark", false); // SDK UI primitives need a theme even in the isolated fixture.
const { visibleWidth } = await jiti.import(path.join(sdk, "node_modules/@earendil-works/pi-tui/dist/index.js"));
const model = { provider: "fixture", id: "fixture-local" };
const questions = [{ question: "First?", context: "Useful context" }, { question: "Second?" }];
const response = (value = { questions }, stopReason = "stop") => ({ stopReason, content: [{ type: "text", text: JSON.stringify(value) }] });
const runtime = (run = async () => response()) => ({ streamSimple: (m, c, o) => ({ result: () => run(m, c, o) }) });
const tui = () => ({ terminal: { rows: 40, columns: 100, write: () => {} }, requestRender: () => {} });
const theme = { fg: (_color, text) => text };

function fixture() {
  const manager = SessionManager.inMemory();
  manager.appendMessage({ role: "assistant", stopReason: "stop", content: [{type: "text", text: "First? Second?"}], timestamp: Date.now() });
  const notices = [], messages = [];
  const ctx = { mode: "tui", hasUI: true, model, isIdle: () => true, sessionManager: manager, modelRegistry: runtime(), ui: { notify: (text, level) => notices.push({text, level}) } };
  let handler;
  extension({ registerCommand: (_name, def) => { handler = def.handler; }, sendUserMessage: msg => messages.push(msg) });
  let stage = 0;
  ctx.ui.custom = factory => new Promise(resolve => {
    const component = factory(tui(), theme, {}, result => { component.dispose?.(); resolve(result); });
    if (stage++ > 0) {
      component.handleInput("first answer"); component.handleInput("\r");
      component.handleInput("second answer"); component.handleInput("\r"); component.handleInput("\r");
    }
  });
  return {ctx, notices, messages, run: () => handler("", ctx)};
}

test("parser validates individual questions, bounds and terminal-safe strings", () => {
  assert.deepEqual(parseExtractionResult(`\`\`\`json\n${JSON.stringify({questions})}\n\`\`\``), {questions});
  assert.deepEqual(parseExtractionResult('{"questions":[]}'), {questions: []});
  for (const value of [null, {}, {questions: [null]}, {questions: [{question: 1}]}, {questions: [{question: " "}]}, {questions: [{question: "ok", context: []}]}, {questions: [{question: "\x1b[31munsafe"}]}, {questions: Array(65).fill({question: "Q?"})}, {questions: [{question: "x".repeat(8193)}]}]) {
    assert.equal(parseExtractionResult(JSON.stringify(value)), null);
  }
  assert.equal(parseExtractionResult("x".repeat(128 * 1024 + 1)), null);
});

test("provider-neutral runtime handles success without exposing or requiring API keys", async () => {
  const registry = runtime(async (selected, context, options) => {
    assert.equal(selected, model); assert.equal(context.messages[0].content[0].text, "Fixture input");
    assert.ok(options.signal); assert.ok(!("apiKey" in options)); return response();
  });
  const outcome = await extractQuestions(registry, model, "Fixture input", new AbortController().signal);
  assert.deepEqual(outcome, {kind: "success", result: {questions}});
});

test("cancellation is distinct from malformed output, provider errors and truncation", async () => {
  const signal = new AbortController(); signal.abort();
  assert.equal((await extractQuestions(runtime(), model, "fixture", signal.signal)).kind, "cancelled");
  for (const reason of ["error", "length", "toolUse"]) {
    assert.equal((await extractQuestions(runtime(async () => response({}, reason)), model, "fixture", new AbortController().signal)).kind, "error");
  }
  assert.equal((await extractQuestions(runtime(async () => response({}, "aborted")), model, "fixture", new AbortController().signal)).kind, "cancelled");
  const bad = await extractQuestions(runtime(async () => response({bad: "shape"})), model, "fixture", new AbortController().signal);
  assert.match(bad.message, /malformed/);
  const failed = await extractQuestions(runtime(async () => { throw new Error("fixture-sensitive-payload"); }), model, "fixture", new AbortController().signal);
  assert.equal(failed.kind, "error"); assert.ok(!failed.message.includes("fixture-sensitive-payload"));
});

test("actual Q&A component preserves navigation, confirmation, focus and width bounds", () => {
  let answer;
  const component = new QnAComponent(questions, tui(), value => { answer = value; });
  component.focused = true; assert.equal(component.editor.focused, true);
  component.handleInput("yes"); component.handleInput("\t"); component.handleInput("no");
  for (const width of [1, 10, 23, 24, 40, 80, 140]) for (const line of component.render(width)) assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
  component.handleInput("\r"); assert.equal(answer, undefined);
  component.handleInput("n"); assert.equal(answer, undefined);
  component.handleInput("\r"); component.handleInput("\r");
  assert.match(answer, /A: yes/); assert.match(answer, /A: no/);
  let cancelled = false;
  const other = new QnAComponent(questions, tui(), value => { cancelled = value === null; });
  other.handleInput("\x1b"); assert.equal(cancelled, true);
});

test("command submits normal user answers, reports extraction errors and blocks non-TUI", async () => {
  const f = fixture(); await f.run(); assert.equal(f.messages.length, 1); assert.match(f.messages[0], /I answered your questions/);
  for (const mode of ["rpc", "json", "print"]) {
    const nonTui = fixture(); nonTui.ctx.mode = mode; await nonTui.run();
    assert.equal(nonTui.messages.length, 0); assert.match(nonTui.notices.at(-1).text, /requires interactive/);
  }
  const failed = fixture(); failed.ctx.modelRegistry = runtime(async () => response({bad: true})); await failed.run();
  assert.equal(failed.notices.at(-1).level, "error"); assert.match(failed.notices.at(-1).text, /malformed/);
  const busy = fixture(); busy.ctx.isIdle = () => false; await busy.run(); assert.match(busy.notices.at(-1).text, /Wait/);
  const missing = fixture(); missing.ctx.model = undefined; await missing.run(); assert.match(missing.notices.at(-1).text, /No model/);
});

test("session/model changes and empty latest responses cannot submit stale answers", async () => {
  for (const change of [f => f.ctx.sessionManager.appendMessage({role: "user", content: "changed branch", timestamp: Date.now()}), f => { f.ctx.model = {...model, id: "other"}; }]) {
    const f = fixture(); f.ctx.modelRegistry = runtime(async () => { change(f); return response(); }); await f.run();
    assert.equal(f.messages.length, 0); assert.match(f.notices.at(-1).text, /Session branch or model changed/);
  }
  const empty = fixture(); empty.ctx.sessionManager.appendMessage({role: "assistant", stopReason: "stop", content: [], timestamp: Date.now()}); await empty.run();
  assert.equal(empty.messages.length, 0); assert.match(empty.notices.at(-1).text, /no text/);
});

test("loader cancellation ignores a late success and resolves only once", async () => {
  const f = fixture(); let calls = 0; let finish;
  f.ctx.modelRegistry = runtime(() => new Promise(resolve => { finish = resolve; }));
  f.ctx.ui.custom = factory => new Promise(resolve => {
    const component = factory(tui(), theme, {}, result => { calls++; component.dispose?.(); resolve(result); });
    component.handleInput("\x1b");
  });
  await f.run(); finish(response()); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1); assert.equal(f.messages.length, 0); assert.equal(f.notices.at(-1).text, "Cancelled");
});

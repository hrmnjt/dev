import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const sdk = process.env.PI_TEST_SDK_ROOT ?? "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent";
const require = createRequire(path.join(sdk, "package.json"));
const { createJiti } = require("jiti");
const { Check } = require("typebox/value");
const jiti = createJiti(import.meta.url, { fsCache: false, alias: {
  "@earendil-works/pi-coding-agent": path.join(sdk, "dist/index.js"),
  typebox: require.resolve("typebox"),
} });
const base = fileURLToPath(new URL("../../pi/.pi/agent/extensions/", import.meta.url));
const canvas = await jiti.import(path.join(base, "tldraw.ts"));
const wal = await jiti.import(path.join(base, "wal-writer.ts"));
const tools = new Map();
const api = { registerTool: tool => tools.set(tool.name, tool), registerCommand: () => {} };
canvas.default(api); wal.default(api);

test("search/exec schemas preserve arbitrary JSON and exact readable text", () => {
  for (const value of [{ success: true, result: [{ id: "fixture", ownership: "local" }], snippetId: "fixture-snippet" }, null, [], "value", 42]) {
    const text = JSON.stringify(value);
    const result = canvas.apiResult(text);
    assert.equal(result.content[0].text, text);
    assert.deepEqual(result.structuredContent, value);
    for (const name of ["tldraw_search", "tldraw_exec"]) {
      assert.ok(Check(tools.get(name).outputSchema, result.structuredContent));
    }
  }
});

test("screenshot structure preserves the image block without host paths or bytes as text", () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]); // Serializer fixture, not decoder/vision proof.
  const result = canvas.screenshotResult("fixture:doc", {
    pageName: "Fixture", width: 1, height: 1, captureMode: "canvas",
    filePath: "/private/fixture-should-never-be-returned.jpg",
  }, bytes);
  assert.ok(Check(tools.get("tldraw_screenshot").outputSchema, result.structuredContent));
  assert.equal(result.content[1], result.structuredContent.image);
  assert.equal(result.content[1].mimeType, "image/jpeg");
  assert.deepEqual(Buffer.from(result.structuredContent.image.data, "base64"), bytes);
  assert.deepEqual(JSON.parse(result.content[0].text), {
    docId: "fixture:doc", pageName: "Fixture", width: 1, height: 1, captureMode: "canvas",
  });
  assert.ok(!JSON.stringify(result).includes("fixture-should-never-be-returned"));
  assert.equal(canvas.screenshotResult("fixture:doc", {}, bytes).structuredContent.docId, "fixture:doc");
});

test("WAL structured fields preserve summary/details but omit internal absolute paths", () => {
  const details = {
    path: "/private/fixture/wal/20261005.md", displayPath: "~/fixture/wal/20261005.md",
    date: "2026-10-05", compactDate: "20261005", created: true, templateUsed: true,
    templatePath: "/private/fixture/wal/daily.md", appendedBytes: 12,
  };
  const result = wal.walAppendResult(details);
  assert.ok(Check(tools.get("wal_append").outputSchema, result.structuredContent));
  assert.equal(result.details, details);
  assert.equal(result.content[0].text, "Appended to ~/fixture/wal/20261005.md · created from daily.md");
  assert.equal(result.structuredContent.appendedBytes, 12);
  assert.ok(!("path" in result.structuredContent));
  assert.ok(!("templatePath" in result.structuredContent));
});

test("validation still rejects unsafe requests before network or WAL writes", async () => {
  await assert.rejects(tools.get("tldraw_search").execute("fixture", { code: " " }), /nonempty/);
  await assert.rejects(tools.get("tldraw_exec").execute("fixture", { docId: "bad\n", code: "return 1" }), /Invalid document id/);
  await assert.rejects(tools.get("tldraw_screenshot").execute("fixture", { docId: "fixture:doc" }, undefined, undefined, { model: { input: ["text"] } }), /image input/);
  await assert.rejects(tools.get("wal_append").execute("fixture", { text: "fixture", date: "20260230" }), /invalid calendar date/);
  await assert.rejects(tools.get("wal_append").execute("fixture", { text: " " }), /must not be empty/);
});

test("SDK QuickJS scripts consume structured fields and forward images explicitly", async () => {
  const { createCodemodeExtension } = await jiti.import(path.join(sdk, "dist/index.js"));
  let codemode;
  createCodemodeExtension({ models: false })({
    registerTool: tool => { codemode = tool; }, getAllTools: () => [...tools.values()],
    getSettings: () => ({ codemode: { mode: "on" } }), appendEntry: () => {},
  });
  const shot = canvas.screenshotResult("fixture:doc", { width: 1, height: 1 }, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const outcomes = new Map([
    ["tldraw_search", canvas.apiResult('{"success":true,"result":{"count":3}}')],
    ["tldraw_screenshot", shot],
    ["wal_append", wal.walAppendResult({ path: "/fixture", displayPath: "~/fixture", date: "2026-10-05", compactDate: "20261005", created: false, templateUsed: false, templatePath: "/fixture-template", appendedBytes: 12 })],
  ]);
  const result = await codemode.execute("fixture", { code: `
    const response = await tools.tldraw_search({code: "return 3"});
    const wal = await tools.wal_append({text: "fixture"});
    const shot = await tools.tldraw_screenshot({docId: "fixture:doc"});
    image(shot.image);
    return {count: response.result.count, appendedBytes: wal.appendedBytes, docId: shot.docId};
  ` }, undefined, undefined, {
    tools: [...tools.values()], sessionManager: { getBranch: () => [] },
    executeTool: async name => ({ toolCall: { id: `fixture/${name}` }, result: outcomes.get(name), isError: false }),
  });
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  const text = result.content.filter(block => block.type === "text").map(block => block.text).join("\n");
  assert.match(text, /"count":3/);
  assert.match(text, /"appendedBytes":12/);
  assert.ok(!text.includes(shot.structuredContent.image.data));
  assert.ok(result.content.some(block => block.type === "image" && block.data === shot.structuredContent.image.data));
  // Mocked tool outcomes verify SDK transport, not live WAL/network/vision behavior.
});

test("guide stays text-based with truthful narrow read-only discovery hints", () => {
  const guide = tools.get("tldraw_guide");
  assert.equal(guide.outputSchema, undefined);
  assert.equal(guide.annotations.readOnlyHint, true);
  assert.deepEqual([...tools.keys()].sort(), ["tldraw_exec", "tldraw_guide", "tldraw_screenshot", "tldraw_search", "wal_append"]);
});

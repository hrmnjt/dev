import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
const sdk = process.env.PI_TEST_SDK_ROOT ?? "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent";
const require = createRequire(path.join(sdk, "package.json"));
const tuiPath = path.join(sdk, "node_modules/@earendil-works/pi-tui/dist/index.js");
const jiti = require("jiti").createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-tui": tuiPath } });
const { ReviewComponent } = await jiti.import(fileURLToPath(new URL("../../pi/.pi/agent/extensions/review.ts", import.meta.url)));
const { TuiAltScreen } = await jiti.import(tuiPath);
const files = ["one.ts", "two.ts"].map(displayPath => ({
  displayPath, oldPath: displayPath, newPath: displayPath, status: "modified", additions: 10, deletions: 0, rawHeader: [],
  hunks: [{ header: "@@ -1 +1,10 @@", section: "", oldStart: 1, oldLines: 1, newStart: 1, newLines: 10,
    lines: Array.from({length: 10}, (_, n) => ({kind: "add", newLine: n + 1, text: `line ${n + 1}`})) }],
}));
const mouse = (type, x, y, wheelDelta) => ({type, button: type === "wheel" ? "none" : "left", x, y, screenX: x + 20, screenY: y + 20, width: 100, height: 40, shift: false, alt: false, ctrl: false, wheelDelta});

function fixture(fullscreen = false) {
  const writes = [];
  const terminal = { rows: 40, columns: 100, write: data => writes.push(data) };
  const tui = fullscreen ? new TuiAltScreen(terminal) : {terminal};
  tui.requestRender = () => {}; // Component test, not a running terminal renderer.
  let result;
  const component = new ReviewComponent(files, {kind: "head"}, tui, value => { result = value; });
  component.render(80); component.handleInput("\t"); component.render(80);
  return {component, writes, result: () => result};
}

test("normalized component-local click/wheel events select existing review hitboxes", () => {
  const f = fixture(true), c = f.component;
  const file = c.hitboxes.find(hit => hit.kind === "file" && hit.fileIndex === 1);
  assert.equal(c.handleMouse(mouse("press", file.colStart - 1, file.row)).handled, true);
  assert.equal(c.selectedFileIndex, 1);
  c.render(100);
  const diff = c.diffBounds;
  const row = diff.rowStart + 3;
  assert.equal(c.handleMouse(mouse("wheel", diff.colStart - 1, row, 1)).handled, true);
  assert.ok(c.selectedLineIndex > 0);
  assert.equal(c.handleMouse(mouse("release", 0, 0)), undefined);
  assert.equal(c.handleMouse(mouse("wheel", 0, 0, 0)), undefined);
  c.focused = true; assert.equal(c.editor.focused, true);
  c.dispose();
  assert.deepEqual(f.writes, []); // Fullscreen owns terminal mouse modes.
});

test("legacy raw SGR mouse handling remains supported and cleanup is idempotent", () => {
  const f = fixture(), c = f.component;
  const file = c.hitboxes.find(hit => hit.kind === "file" && hit.fileIndex === 1);
  c.handleInput(`\x1b[<0;${file.colStart};${file.row + c.lastRenderTopRow}M`);
  assert.equal(c.selectedFileIndex, 1);
  c.dispose(); c.dispose();
  assert.deepEqual(f.writes, ["\x1b[?1000h\x1b[?1006h", "\x1b[?1000l\x1b[?1006l"]);
});

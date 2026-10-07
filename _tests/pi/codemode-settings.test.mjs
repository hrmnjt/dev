import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { test } from "node:test";

const settings = JSON.parse(await fs.readFile(new URL("../../pi/.pi/agent/settings.template.json", import.meta.url), "utf8"));

test("codemode defaults keep direct filesystem/shell tools declared", () => {
  assert.equal(settings.codemode.mode, "on");
  for (const name of ["read", "write", "edit", "bash", "codemode"]) {
    assert.ok(settings.defaultTools.includes(name), `Missing default tool: ${name}`);
  }
});

test("documented host activation preserves unrelated settings and codemode options", async () => {
  const docs = await fs.readFile(new URL("../../pi/README.md", import.meta.url), "utf8");
  const match = docs.match(/jq '([\s\S]*?)' \\\n  "\$settings"/);
  assert.ok(match, "Missing documented activation expression");
  const input = {
    defaultTools: ["read", "write", "edit", "bash", "-codemode", "+other-tool"],
    codemode: { mode: "only", inlineBudget: 500 },
    defaultProvider: "unchanged-provider", defaultModel: "unchanged-model",
    defaultThinkingLevel: "high", theme: "gruvbox-dark/gruvbox-dark", tuiMode: "fullscreen",
    enabledModels: ["unchanged-local-model"], unrelated: { preserve: true },
  };
  const output = JSON.parse(execFileSync("jq", [match[1]], { input: JSON.stringify(input), encoding: "utf8" }));
  assert.deepEqual(output.defaultTools, ["read", "write", "edit", "bash", "+other-tool", "+codemode"]);
  assert.deepEqual(output.codemode, { mode: "on", inlineBudget: 500 });
  const { defaultTools: _oldTools, codemode: _oldMode, ...original } = input;
  const { defaultTools: _newTools, codemode: _newMode, ...preserved } = output;
  assert.deepEqual(preserved, original);
});

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

test("documented VM migration disables only MCP, preserving direct tools and codemode options", async () => {
  const docs = await fs.readFile(new URL("../../pi/README.md", import.meta.url), "utf8");
  const match = docs.match(/jq '([\s\S]*?)' \\\n  "\$settings"/);
  assert.ok(match, "Missing documented activation expression");
  const input = {
    defaultTools: ["read", "write", "edit", "bash", "-codemode", "+other-tool"],
    codemode: { mode: "only", inlineBudget: 500 },
    defaultProvider: "unchanged-provider", defaultModel: "unchanged-model",
    defaultThinkingLevel: "high", theme: "gruvbox-dark/gruvbox-dark", tuiMode: "fullscreen",
    enabledModels: ["unchanged-local-model"], unrelated: { preserve: true },
    extensions: ["builtin:mcp", "+builtin:mcp", "custom-extension"],
  };
  const output = JSON.parse(execFileSync("jq", [match[1]], { input: JSON.stringify(input), encoding: "utf8" }));
  assert.deepEqual(output,{...input,extensions:["custom-extension","-builtin:mcp"]});
  assert.deepEqual(JSON.parse(execFileSync("jq",[match[1]],{input:JSON.stringify(output),encoding:"utf8"})),output);
});

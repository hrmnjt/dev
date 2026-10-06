import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { test } from "node:test";

const template = JSON.parse(await fs.readFile(new URL("../../pi/.pi/agent/settings.template.json", import.meta.url), "utf8"));
const docs = await fs.readFile(new URL("../../pi/README.md", import.meta.url), "utf8");
const match = docs.match(/jq '(\.defaultProvider = "openai"[\s\S]*?)' "\$settings"/);
assert.ok(match, "Missing documented minimal model-settings delta");
const apply = input => JSON.parse(execFileSync("jq", [match[1]], { input: JSON.stringify(input), encoding: "utf8" }));

test("template selects the exact requested provider/model/high and retains local shortlist", () => {
  assert.equal(template.defaultProvider, "openai");
  assert.equal(template.defaultModel, "gpt-6.1-sol");
  assert.equal(template.defaultThinkingLevel, "high");
  assert.equal(template.modelThinkingLevels["openai/gpt-6.1-sol"], "high");
  assert.deepEqual(template.enabledModels, [
    "llama.cpp/unsloth/Qwen3.5-122B-A10B-GGUF:UD-Q5_K_XL",
    "llama.cpp/unsloth/GLM-4.7-Flash-GGUF:Q8_0",
    "openai/gpt-6.1-sol",
  ]);
});

test("host delta changes only requested defaults, exact thinking override and list inclusion", () => {
  const input = {
    defaultProvider: "old", defaultModel: "old", defaultThinkingLevel: "medium",
    modelThinkingLevels: { "openai/gpt-6.1-sol": "low", "fixture/local": "off" },
    enabledModels: ["fixture/local", "old/cloud"],
    theme: "gruvbox-dark/gruvbox-dark", tuiMode: "fullscreen",
    defaultTools: ["read", "write", "edit", "bash", "+codemode"],
    codemode: { mode: "on", inlineBudget: 500 }, unrelated: { keep: true },
  };
  const output = apply(input);
  assert.deepEqual(output, { ...input,
    defaultProvider: "openai", defaultModel: "gpt-6.1-sol", defaultThinkingLevel: "high",
    modelThinkingLevels: { ...input.modelThinkingLevels, "openai/gpt-6.1-sol": "high" },
    enabledModels: ["fixture/local", "old/cloud", "openai/gpt-6.1-sol"],
  });
  assert.deepEqual(apply(output), output, "Delta is idempotent");
});

test("absent unrestricted enabled-model selection is not narrowed by activation", () => {
  const output = apply({ unrelated: true });
  assert.ok(!("enabledModels" in output));
  assert.equal(output.unrelated, true);
  assert.equal(output.defaultModel, "gpt-6.1-sol");
});

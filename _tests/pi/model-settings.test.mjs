import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";

const template = JSON.parse(await fs.readFile(new URL("../../pi/.pi/agent/settings.template.json", import.meta.url), "utf8"));

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

test("template leaves the built-in extensions, including MCP, enabled", () => {
  assert.ok(!("extensions" in template));
});

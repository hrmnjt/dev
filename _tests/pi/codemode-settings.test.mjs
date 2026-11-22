import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";

const settings = JSON.parse(await fs.readFile(new URL("../../pi/.pi/agent/settings.template.json", import.meta.url), "utf8"));

test("codemode defaults keep direct filesystem/shell tools declared", () => {
  assert.equal(settings.codemode.mode, "on");
  for (const name of ["read", "write", "edit", "bash", "codemode"]) {
    assert.ok(settings.defaultTools.includes(name), `Missing default tool: ${name}`);
  }
});

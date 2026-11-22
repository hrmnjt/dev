import assert from "node:assert/strict";
import fs from "node:fs";
import {test} from "node:test";
import {verifyClis} from "../../gondolin/.config/gondolin/guest/check-clis.mjs";
const pins = JSON.parse(fs.readFileSync("gondolin/.config/gondolin/pins.json","utf8"));
function fixture() {
  const f = {calls:[],claude:pins.claude+" (Claude Code)",uv:`uv ${pins.uv} (fixture 2026-11-17)`,versions:{"@anthropic-ai/claude-code":pins.claude,playwright:pins.playwright}};
  const deps = {
    readFile:file => {
      const pkg = file.slice("/usr/local/lib/node_modules/".length,-"/package.json".length);
      assert.ok(Object.hasOwn(f.versions,pkg),"Only synthetic package metadata may be read");
      return JSON.stringify({version:f.versions[pkg]});
    },
    run:(binary,args) => {
      f.calls.push([binary,args]);
      if (binary === "/usr/local/bin/uv") return f.uv;
      assert.equal(binary,"/usr/local/bin/claude");
      if (f.claudeError) throw f.claudeError;
      return f.claude;
    },
  };
  return {f,deps};
}
test("pinned package versions and Claude's and uv's own version output pass",() => {
  const {f,deps} = fixture();verifyClis(pins,deps);
  assert.deepEqual(f.calls,[["/usr/local/bin/claude",["--version"]],["/usr/local/bin/uv",["--version"]]]);
  assert.ok(pins.uvImage.includes(`:${pins.uv}@sha256:`),"uv image tag matches the pinned version");
});
test("CLI failure reports command, status, stdout and stderr instead of a silent grep failure",() => {
  const {f,deps} = fixture();f.claudeError = Object.assign(new Error("execution failed"),{status:7,stdout:"partial output\n",stderr:"native executable failed\n"});
  assert.throws(() => verifyClis(pins,deps),error => ["claude --version failed (7)","partial output","native executable failed"].every(text => error.message.includes(text)));
});
test("package and executable version mismatches remain fail-closed",() => {
  const {f,deps} = fixture();f.versions.playwright = "fixture-wrong-version";
  assert.throws(() => verifyClis(pins,deps),/playwright version mismatch/);assert.equal(f.calls.length,0);
  const other = fixture();other.f.claude = "fixture-wrong-version";
  assert.throws(() => verifyClis(pins,other.deps),/Claude version output did not match/);
  const uv = fixture();uv.f.uv = `uv ${pins.uv}0`;
  assert.throws(() => verifyClis(pins,uv.deps),/uv version output did not match/);
});

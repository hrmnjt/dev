import assert from "node:assert/strict";
import fs from "node:fs";
import {test} from "node:test";
import {verifyClis} from "../../gondolin/.config/gondolin/guest/check-clis.mjs";
const pins = JSON.parse(fs.readFileSync("gondolin/.config/gondolin/pins.json","utf8"));
function fixture() {
  const f = {calls:[],claude:pins.claude+" (Claude Code)",help:"Options:\n--settings-file <value>\nSettings reference:\namp.dangerouslyAllowAll\n",
    versions:{"@anthropic-ai/claude-code":pins.claude,"@ampcode/cli":pins.amp,playwright:pins.playwright}};
  const deps = {
    readFile:file => {
      const pkg = file.slice("/usr/local/lib/node_modules/".length,-"/package.json".length);
      assert.ok(Object.hasOwn(f.versions,pkg),"Only synthetic package metadata may be read");
      return JSON.stringify({version:f.versions[pkg]});
    },
    run:(binary,args) => {
      f.calls.push([binary,args]);
      if (binary === "/usr/local/bin/claude") return f.claude;
      assert.equal(binary,"/usr/local/bin/amp");
      if (f.ampError) throw f.ampError;
      return f.help;
    },
  };
  return {f,deps};
}
test("pinned Amp help documents the settings key without the assumed CLI bypass flag",() => {
  const {f,deps} = fixture();
  assert.ok(!f.help.includes("--dangerously-allow-all"));verifyClis(pins,deps);
  assert.deepEqual(f.calls,[["/usr/local/bin/claude",["--version"]],["/usr/local/bin/amp",["--help"]]]);
});
test("missing Amp bypass setting or custom-settings option fails with visible help",() => {
  for (const required of ["amp.dangerouslyAllowAll","--settings-file"]) {
    const {f,deps} = fixture();f.help = f.help.replace(required,"");
    assert.throws(() => verifyClis(pins,deps),error => error.message.includes("missing "+required) && error.message.includes("Settings reference:"));
  }
});
test("CLI failure reports command, status, stdout and stderr instead of a silent grep failure",() => {
  const {f,deps} = fixture();f.ampError = Object.assign(new Error("execution failed"),{status:7,stdout:"partial help\n",stderr:"native executable failed\n"});
  assert.throws(() => verifyClis(pins,deps),error => ["amp --help failed (7)","partial help","native executable failed"].every(text => error.message.includes(text)));
});
test("package and executable version mismatches remain fail-closed",() => {
  const {f,deps} = fixture();f.versions["@ampcode/cli"] = "fixture-wrong-version";
  assert.throws(() => verifyClis(pins,deps),/@ampcode\/cli version mismatch/);assert.equal(f.calls.length,0);
  const other = fixture();other.f.claude = "fixture-wrong-version";
  assert.throws(() => verifyClis(pins,other.deps),/Claude version output did not match/);
});

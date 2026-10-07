import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
const sdk = process.env.PI_TEST_SDK_ROOT ?? "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent";
const fixture = fileURLToPath(new URL("fixtures/sandbox.mjs", import.meta.url));
for (const failure of ["startup", "launcher"]) {
  for (const obsoleteSetting of [false, true]) {
    test(`native-only registration blocks ${failure} failure; obsolete setting=${obsoleteSetting}`, { skip: !existsSync(path.join(sdk, "package.json")) && "Set PI_TEST_SDK_ROOT to the installed Pi package" }, () => {
      const env = { ...process.env, PI_TEST_SDK_ROOT: sdk, PI_TEST_FAILURE: failure };
      if (obsoleteSetting) env.PI_SANDBOX_BACKEND = "off"; else delete env.PI_SANDBOX_BACKEND;
      execFileSync(process.execPath, [fixture], { env, stdio: ["ignore", "pipe", "pipe"] });
    });
  }
}

// Locate the installed Pi package for SDK-backed tests; nothing is imported here.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "@earendil-works/pi-coding-agent";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const isPackage = dir => {
  try {return JSON.parse(fs.readFileSync(path.join(dir,"package.json"),"utf8")).name === NAME;}
  catch {return false;}
};

export function piSdkRoot() {
  if (process.env.PI_TEST_SDK_ROOT) return process.env.PI_TEST_SDK_ROOT;
  // A Node install of the launcher's ~/.pi/agent/bin/pi leads to its package.
  try {
    let dir = path.dirname(fs.realpathSync(path.join(os.homedir(),".pi/agent/bin/pi")));
    for (; dir !== path.dirname(dir); dir = path.dirname(dir)) {
      if (isPackage(dir)) return dir;
      if (isPackage(path.join(dir,"node_modules",NAME))) return path.join(dir,"node_modules",NAME);
    }
  } catch { /* No readable host Pi launcher. */ }
  // A Bun binary ships no Node SDK; tests then use a disposable copy in _scratch.
  for (const dir of [path.join(ROOT,"_scratch/pi-sdk/node_modules",NAME),path.join("/opt/homebrew/lib/node_modules",NAME)]) {
    if (isPackage(dir)) return dir;
  }
  throw new Error(`Pi SDK not found. Install a disposable copy matching host Pi:
  npm install --ignore-scripts --prefix _scratch/pi-sdk "${NAME}@$(~/.pi/agent/bin/pi --version)"
or set PI_TEST_SDK_ROOT to an installed ${NAME} package directory.`);
}

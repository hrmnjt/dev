// Locate the installed Pi package for SDK-backed tests; nothing is imported here.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const NAME = "@earendil-works/pi-coding-agent";
const isPackage = dir => {
  try {return JSON.parse(fs.readFileSync(path.join(dir,"package.json"),"utf8")).name === NAME;}
  catch {return false;}
};

export function piSdkRoot() {
  if (process.env.PI_TEST_SDK_ROOT) return process.env.PI_TEST_SDK_ROOT;
  // The shared launcher runs ~/.pi/agent/bin/pi; follow it to its package.
  try {
    let dir = path.dirname(fs.realpathSync(path.join(os.homedir(),".pi/agent/bin/pi")));
    for (; dir !== path.dirname(dir); dir = path.dirname(dir)) {
      if (isPackage(dir)) return dir;
      if (isPackage(path.join(dir,"node_modules",NAME))) return path.join(dir,"node_modules",NAME);
    }
  } catch { /* No readable host Pi launcher. */ }
  const homebrew = path.join("/opt/homebrew/lib/node_modules",NAME);
  if (isPackage(homebrew)) return homebrew;
  throw new Error(`Pi SDK not found; set PI_TEST_SDK_ROOT to the installed ${NAME} package directory.`);
}

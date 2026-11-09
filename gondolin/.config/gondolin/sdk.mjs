// Stow --no-folding leaves modules as symlinks and node_modules in the real
// deployment directory. Resolve dependencies from the chosen install prefix,
// not the canonical source file's directory. Branch trials choose their prefix.
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
import {CONFIG_DIR,pins} from "./policy.mjs";
export const INSTALL_DIR = process.env.AGENT_VM_CONFIG ?? CONFIG_DIR;
export async function loadGondolin(directory = INSTALL_DIR) {
  try {
    const installed = JSON.parse(fs.readFileSync(path.join(directory,"node_modules/@earendil-works/gondolin/package.json"),"utf8"));
    if (installed.version !== pins.gondolin) throw new Error();
    const require = createRequire(path.join(directory,"package.json"));
    return await import(pathToFileURL(require.resolve("@earendil-works/gondolin")).href);
  } catch {throw new Error(`Gondolin dependency missing or version mismatch. On the Mac run: npm ci --prefix ${directory}`);}
}

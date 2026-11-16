// Build-time interface checks. Importing this module never executes a CLI.
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";

export function verifyClis(pins, {run = execFileSync, readFile = fs.readFileSync} = {}) {
  for (const [pkg, expected] of [["@anthropic-ai/claude-code",pins.claude],["playwright",pins.playwright]]) {
    const installed = JSON.parse(readFile(`/usr/local/lib/node_modules/${pkg}/package.json`,"utf8")).version;
    if (installed !== expected) throw new Error(`${pkg} version mismatch: expected ${expected}, got ${installed}`);
  }
  const command = (binary, args) => {
    try {return String(run(binary,args,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:30000}));}
    catch (error) {
      throw new Error(`${binary} ${args.join(" ")} failed (${error.status ?? error.code ?? "unknown status"})\n${error.stdout ?? ""}${error.stderr ?? error.message}`);
    }
  };
  const claude = command("/usr/local/bin/claude",["--version"]);
  if (!claude.trim().startsWith(pins.claude+" ") && claude.trim() !== pins.claude) throw new Error(`Claude version output did not match ${pins.claude}: ${claude}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    verifyClis(JSON.parse(fs.readFileSync("/opt/agent-pins.json","utf8")));
    console.log("Verified pinned CLI versions.");
  } catch (error) {console.error(error.message);process.exitCode = 1;}
}

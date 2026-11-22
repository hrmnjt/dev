#!/usr/bin/env node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { parsePreview, agentCommand } from "./policy.mjs";
import { buildImage, requireImage } from "./image.mjs";
import { credentialStatus } from "./credentials.mjs";
import { createSession } from "./session.mjs";
import { loadGondolin } from "./sdk.mjs";

export function launchOptions(argv) {
  const args = [...argv]; let preview;
  if (args[0] === "--preview") {
    preview = parsePreview(args[1] ?? "");args.splice(0,2);
  }
  if (args[0] === "--") args.shift();
  return {preview,args};
}
// Pi has no launcher: its installer owns `pi`, and the Gondolin extension
// starts the VM. Only Claude runs inside a session VM from here.
export async function main(argv = process.argv.slice(2)) {
  const [agent,...rest] = argv;
  if (!agent || ["--help","help"].includes(agent)) {
    console.log("agent-vm build docker|podman\nagent-vm doctor\nclaude [--preview PORT] [Claude options]\nclaude setup-token  # throwaway VM, no host mounts or supplied credentials");return 0;
  }
  if (agent === "pi" || agent === "trial-pi") throw new Error("Pi no longer uses agent-vm: run pi directly (see pi/README.md; branch trials: gondolin/README.md).");
  if (agent === "build") {await buildImage(rest[0]);return 0;}
  if (agent === "doctor") {
    let warnings = 0;
    try {await loadGondolin();console.log("PASS pinned Gondolin dependency");} catch(error) {warnings++;console.log("WARN "+error.message);}
    try {requireImage();console.log("PASS pinned Gondolin image marker (boot not tested)");} catch(error) {warnings++;console.log("WARN "+error.message);}
    for (const status of credentialStatus()) {console.log(status.level.toUpperCase()+" "+status.message);if (status.level !== "pass") warnings++;}
    return warnings ? 1:0;
  }
  const {preview,args} = launchOptions(rest);
  const setupToken = agent === "claude" && args.length === 1 && args[0] === "setup-token";
  if (setupToken && preview) throw new Error("setup-token cannot publish previews.");
  const command = setupToken ? ["/usr/local/bin/claude","setup-token"] : agentCommand(agent,args);
  let session;
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGINT",stop);process.on("SIGTERM",stop);
  try {
    session = await createSession({agent,preview,setupToken,signal:controller.signal});
    if (session.ingress) console.error(`Preview: http://${session.ingress.host}:${session.ingress.port}/ (guest port ${preview}; loopback only)`);
    const terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    const proc = session.exec(command,{pty:terminal,stdin:terminal ? true:process.stdin,signal:controller.signal,stdout:terminal ? "pipe":"inherit",stderr:terminal ? "pipe":"inherit"});
    if (terminal) proc.attach(process.stdin,process.stdout,process.stderr);
    const result = await proc;
    return result.exitCode;
  } finally {process.off("SIGINT",stop);process.off("SIGTERM",stop);await session?.close();}
}
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main().then(code => {process.exitCode = code;}).catch(error => {console.error(error.message);process.exitCode = 1;});
}

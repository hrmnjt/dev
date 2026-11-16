#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR, projectInfo, parsePreview, agentCommand } from "./policy.mjs";
import { buildImage, requireImage } from "./image.mjs";
import { credentialStatus } from "./credentials.mjs";
import { createSession } from "./session.mjs";
import { INSTALL_DIR, loadGondolin } from "./sdk.mjs";

export function launchOptions(argv) {
  const args = [...argv]; let preview;
  if (args[0] === "--preview") {
    preview = parsePreview(args[1] ?? "");args.splice(0,2);
  }
  if (args[0] === "--") args.shift();
  return {preview,args};
}
async function child(binary,args,env) {
  const proc = spawn(binary,args,{env,stdio:"inherit"});
  const stop = signal => proc.kill(signal);
  const onInt = () => stop("SIGINT"), onTerm = () => stop("SIGTERM");
  process.on("SIGINT",onInt);process.on("SIGTERM",onTerm);
  try {return await new Promise((resolve,reject) => {proc.once("error",reject);proc.once("exit",(code,signal) => resolve(code ?? (signal === "SIGINT" ? 130:143)));});}
  finally {process.off("SIGINT",onInt);process.off("SIGTERM",onTerm);}
}
export async function runPi(args, trial = false) {
  const hostPi = path.join(os.homedir(),".pi/agent/bin/pi");
  if (!fs.existsSync(hostPi)) throw new Error(`Host Pi missing at ${hostPi}; install Pi using pi/README.md. No alternative backend will be used.`);
  const project = projectInfo(process.cwd());
  const sessions = path.join(os.homedir(),".local/state/agent-vm",project.key,"pi","sessions");
  fs.mkdirSync(sessions,{recursive:true,mode:0o700});
  const env = {...process.env,AGENT_VM_CONFIG:INSTALL_DIR,PI_CODING_AGENT_SESSION_DIR:sessions};
  const checkout = path.resolve(CONFIG_DIR,"../../..");
  const source = path.join(checkout,"pi/.pi/agent");
  const backend = ["--no-extensions","--no-mcp"];
  for (const name of ["gondolin","answer","caffeinate","clipboard-image","exit","review","review-summary","tldraw"]) {
    const file = path.join(source,"extensions",name+".ts");
    if (!fs.existsSync(file)) throw new Error("Pi VM extension missing; deploy from the primary checkout with just stowall (see pi/README.md).");
    backend.push("-e",file);
  }
  for (const name of ["codemode","llama.cpp","tool-search"]) backend.push("-e","builtin:"+name);
  if (!trial) return child(hostPi,[...backend,...args],env);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),"pi-vm-trial-"));
  try {
    fs.copyFileSync(path.join(source,"settings.template.json"),path.join(temporary,"settings.json"));
    const auth = path.join(os.homedir(),".pi/agent/auth.json");
    if (fs.existsSync(auth)) fs.symlinkSync(auth,path.join(temporary,"auth.json"));
    const explicit = [...backend,"--no-skills","--no-prompt-templates","--no-themes","--no-approve"];
    explicit.push("--theme",path.join(source,"themes/gruvbox-dark.json"));
    return await child(hostPi,[...explicit,...args],{...env,PI_CODING_AGENT_DIR:temporary});
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
}
export async function main(argv = process.argv.slice(2)) {
  const [agent,...rest] = argv;
  if (!agent || ["--help","help"].includes(agent)) {
    console.log("agent-vm build docker|podman\nagent-vm doctor\nagent-vm pi [Pi options]\nagent-vm trial-pi [Pi options]  # isolated branch config, no Stow\nclaude [--preview PORT] [Claude options]\nclaude setup-token  # throwaway VM, no host mounts or supplied credentials");return 0;
  }
  if (agent === "build") {await buildImage(rest[0]);return 0;}
  if (agent === "doctor") {
    let warnings = 0;
    try {await loadGondolin();console.log("PASS pinned Gondolin dependency");} catch(error) {warnings++;console.log("WARN "+error.message);}
    try {requireImage();console.log("PASS pinned Gondolin image marker (boot not tested)");} catch(error) {warnings++;console.log("WARN "+error.message);}
    for (const status of credentialStatus()) {console.log(status.level.toUpperCase()+" "+status.message);if (status.level !== "pass") warnings++;}
    return warnings ? 1:0;
  }
  if (agent === "pi" || agent === "trial-pi") return runPi(rest,agent === "trial-pi");
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

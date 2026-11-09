/** Host Pi, VM-only model tools. Deliberate !/!! and review UI stay on the Mac. */
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createBashToolDefinition, createReadToolDefinition, createWriteToolDefinition,
  createEditToolDefinition, getDocsPath, getExamplesPath, type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { VmOutputs } from "./lib/vm-output.ts";

const allowed = new Set(["read","write","edit","bash","codemode","tool_search",
  "tldraw_guide","tldraw_search","tldraw_exec","tldraw_screenshot"]);
const guestPath = (input:string) => input.replace(/^@?~(?=\/|$)/,"/home/agent");
async function readGuestFile(vm:any, file:string, signal?:AbortSignal):Promise<Buffer> {
  const maximum = 64 * 1024 * 1024;
  const stat = await vm.fs.stat(file,{signal});
  if (!stat.isFile() || stat.size > maximum) throw new Error("Read requires a regular guest file up to 64 MiB.");
  const stream = await vm.fs.readFileStream(file,{signal});
  const chunks:Buffer[] = [];let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > maximum) throw new Error("Guest file grew beyond 64 MiB while reading.");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } finally {stream.destroy();}
}
export default function(pi:ExtensionAPI) {
  const cwd = process.cwd();
  const startup = new AbortController();
  let session:any, starting:Promise<any> | undefined, outputs:VmOutputs | undefined, stopped = false;
  async function ready() {
    if (stopped) throw new Error("Gondolin session has stopped; start a fresh Pi session.");
    if (session) return session;
    if (!starting) starting = (async () => {
      const directory = process.env.AGENT_VM_CONFIG ?? path.join(os.homedir(),".config/gondolin");
      const backend = await import(pathToFileURL(path.join(directory,"session.mjs")).href);
      outputs = new VmOutputs();
      try {
        const created = await backend.createSession({agent:"pi",cwd,signal:startup.signal,installationDirectory:directory,outputDirectory:outputs.directory,
          resources:{"/pi/docs":getDocsPath(),"/pi/examples":getExamplesPath()}});
        if (stopped) {await created.close();throw new Error("Session shut down during VM startup");}
        session = created;
        return created;
      } catch (error) {outputs?.dispose();outputs = undefined;throw error;}
    })(); // Cache rejection: a failed session never silently retries or falls back.
    return starting;
  }
  pi.on("tool_call",async event => {
    await ready();
    if (!allowed.has(event.toolName)) return {block:true,reason:`Tool ${event.toolName} is not routed to Gondolin. Use bash inside the VM; no host fallback.`};
  });
  pi.registerTool({...createReadToolDefinition(cwd),async execute(id,params,signal,onUpdate,ctx) {
    const {vm} = await ready();
    return createReadToolDefinition(cwd,{operations:{
      access:p => vm.fs.access(p,{signal}), readFile:p => readGuestFile(vm,p,signal),
      detectImageMimeType:async p => ({".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".gif":"image/gif",".webp":"image/webp",".bmp":"image/bmp"}[path.extname(p).toLowerCase()] ?? null),
    }}).execute(id,{...params,path:guestPath(params.path)},signal,onUpdate,ctx);
  }});
  pi.registerTool({...createWriteToolDefinition(cwd),async execute(id,params,signal,onUpdate,ctx) {
    const {vm} = await ready();
    return createWriteToolDefinition(cwd,{operations:{
      mkdir:p => vm.fs.mkdir(p,{recursive:true,signal}),
      writeFile:(p,content) => vm.fs.writeFile(p,content,{signal}),
    }}).execute(id,{...params,path:guestPath(params.path)},signal,onUpdate,ctx);
  }});
  pi.registerTool({...createEditToolDefinition(cwd),async execute(id,params,signal,onUpdate,ctx) {
    const {vm} = await ready();
    return createEditToolDefinition(cwd,{operations:{
      access:p => vm.fs.access(p,{signal}), readFile:p => readGuestFile(vm,p,signal),
      writeFile:(p,content) => vm.fs.writeFile(p,content,{signal}),
    }}).execute(id,{...params,path:guestPath(params.path)},signal,onUpdate,ctx);
  }});
  pi.registerTool({...createBashToolDefinition(cwd),async execute(id,params,signal,onUpdate,ctx) {
    const active = await ready();
    return outputs!.expose(await createBashToolDefinition(cwd,{operations:{exec:(command,directory,options) => active.bash(command,directory,options)}})
      .execute(id,params,signal,update => onUpdate?.(outputs!.expose(update)),ctx));
  }});
  pi.on("session_start",async (_event,ctx) => {
    try {await ready();ctx.ui.setStatus("gondolin",`VM ${session.vm.id.slice(0,8)}`);}
    catch (error) {ctx.ui.notify(`Gondolin unavailable: ${error instanceof Error ? error.message : "check agent-vm doctor"}\nSee gondolin/README.md; no tools ran on the Mac.`,"error");ctx.shutdown();}
  });
  pi.on("session_shutdown",async () => {
    stopped = true;startup.abort();
    try {if (starting) {try {await starting;} catch { /* Failed startup owns its cleanup. */ }} await session?.close();}
    finally {session = undefined;outputs?.dispose();outputs = undefined;}
  });
  pi.registerCommand("gondolin",{description:"Show this session's VM and mounts",handler:async (_args,ctx) => {
    const active = await ready();
    ctx.ui.notify(`VM: ${active.vm.id}\nWorkspace: ${active.project.workspace}\nCommon Git dir: ${active.project.common ?? "none"}\nRead-only: .pi, .claude, Git hooks, global Git config\nDocs: /pi/docs; examples: /pi/examples\n! and !! run on the Mac`,"info");
  }});
  pi.on("before_agent_start",async event => {
    const active = await ready();
    return {systemPrompt:event.systemPrompt+`\n\nGondolin VM tool environment:\n- read/write/edit/bash (also nested/codemode calls) run only in Linux, never on the Mac. Use bash for rg/find/ls and normal Git/network/package commands.\n- Workspace: ${active.project.workspace}; initial cwd: ${cwd}. Paths are identical to host paths inside the mounted worktree. The common Git directory is also mounted for linked worktrees.\n- .pi/, .claude/, Git hooks, tracked agent configuration and the guest global Git config are read-only. Do not work around these protections. Repo .git/config remains writable; do not change core.hooksPath to bypass review.\n- Git identity is selected from the primary repository, with user.useConfigOnly=true and no fallback. Real credentials stay in the Mac Keychain; guest tokens are placeholders scoped to their API hosts. No SSH agent or host environment is forwarded. GitHub SSH URLs are rewritten to HTTPS.\n- Public internet is open; Mac/private-network services are blocked. No agent may invoke host services to bypass the VM. tldraw is the deliberate narrow canvas exception: use its registered tools and tldraw_guide.\n- Bash overflow is readable at /pi-output/... and is read-only. Never use host temp paths. VM changes outside the worktree and per-project state are discarded on exit.\n- Pi docs: /pi/docs; examples: /pi/examples. Pi's sign-in and model requests stay on the host; there is no login inside the VM.\n- Brew, Stow, live npm installs, image builds, Keychain, host services, and GitHub settings are deliberate user operations. !/!! are user-only Mac shell commands, not an agent escape hatch.`};
  });
  // No user_bash hook: the user's ! and !! intentionally keep host semantics.
}

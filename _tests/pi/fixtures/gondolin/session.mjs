// Fake VM transport only; no process or host filesystem operation is performed.
import {Readable} from "node:stream";
export async function createSession(options) {
  const f = globalThis.__gondolinFixture;
  f.starts++;f.options = options;f.startEntered?.resolve(options);
  if (f.startGate) await f.startGate;
  if (f.failure) throw new Error("Pinned image missing; run agent-vm build");
  const files = f.files;
  const missing = p => {if (!files.has(p)) throw new Error("Guest ENOENT: "+p);};
  return {vm:{id:"fixture-vm",fs:{
    access:async p => {f.calls.push(["access",p]);missing(p);},
    stat:async p => {missing(p);return {isFile:() => !f.nonregular,size:f.sizeOverride ?? files.get(p).length};},
    readFileStream:async p => {f.calls.push(["read",p]);missing(p);return Readable.from([files.get(p)]);},
    mkdir:async p => {f.calls.push(["mkdir",p]);},
    writeFile:async (p,content) => {f.calls.push(["write",p]);files.set(p,Buffer.from(content));},
  }},project:{workspace:process.cwd(),common:"/guest-common"},
  bash:async (command,cwd,options) => {
    f.calls.push(["bash",command,cwd]);
    options.onData(Buffer.from(f.output ?? "guest output"));
    return {exitCode:f.exitCode ?? 0};
  },close:async () => {f.closes++;}};
}

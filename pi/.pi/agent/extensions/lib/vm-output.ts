/** Bridge only SDK-owned bash logs into a per-session read-only VM mount. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class VmOutputs {
  readonly directory: string;
  private files = new Map<string, {guest:string; dev:number; ino:number}>();
  constructor(temp = os.tmpdir()) {
    this.directory = fs.mkdtempSync(path.join(temp,"pi-vm-output-"));
    fs.chmodSync(this.directory,0o700);
  }
  expose<T extends {content:any[]; details?:any; structuredContent?:any}>(result:T):T {
    const host = result.details?.fullOutputPath;
    if (!host) return result;
    let owned = this.files.get(host);
    if (!owned) {
      const stat = fs.lstatSync(host);
      if (fs.realpathSync(path.dirname(host)) !== fs.realpathSync(os.tmpdir()) || !/^pi-bash-[a-zA-Z0-9-]+\.log$/.test(path.basename(host)) ||
          !stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || stat.nlink !== 1) throw new Error("Refusing a non-SDK bash overflow file");
      const name = path.basename(host);
      fs.linkSync(host,path.join(this.directory,name));
      owned = {guest:"/pi-output/"+name,dev:stat.dev,ino:stat.ino};
      this.files.set(host,owned);
    }
    const guest = owned.guest;
    return {...result,
      content:result.content.map(block => block.type === "text" ? {...block,text:block.text.replaceAll(host,guest)} : block),
      details:{...result.details,fullOutputPath:guest},
      ...(result.structuredContent ? {structuredContent:{...result.structuredContent,...(result.structuredContent.full_output_path ? {full_output_path:guest} : {})}} : {}),
    };
  }
  dispose() {
    for (const [file,owned] of this.files) {
      try { const stat = fs.lstatSync(file);if (stat.dev === owned.dev && stat.ino === owned.ino) fs.unlinkSync(file); } catch { /* Already removed by SDK. */ }
    }
    this.files.clear();
    fs.rmSync(this.directory,{recursive:true,force:true});
  }
}

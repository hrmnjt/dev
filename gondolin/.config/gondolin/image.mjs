import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { CONFIG_DIR, pins, readJson } from "./policy.mjs";
import { loadGondolin } from "./sdk.mjs";

export function imageSpec() {
  const arch = process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : null;
  if (!arch) throw new Error("Agent VMs require an arm64 or x64 host.");
  const hash = createHash("sha256").update(arch);
  for (const file of ["pins.json","Dockerfile","guest/clipboard.mjs","guest/agent-enter","guest/check-clis.mjs"]) hash.update(file).update(fs.readFileSync(path.join(CONFIG_DIR,file)));
  return {schema:1, arch, fingerprint:hash.digest("hex"), pins};
}
export function imageDirectory(spec = imageSpec()) {
  return path.join(os.homedir(), ".local/share/agent-vm/images", spec.fingerprint);
}
export function requireImage() {
  const spec = imageSpec(), directory = imageDirectory(spec);
  try {
    if (readJson(path.join(directory,"agent-image.json")).fingerprint !== spec.fingerprint || !fs.existsSync(path.join(directory,"manifest.json"))) throw new Error();
  } catch { throw new Error("Pinned Gondolin image missing or stale. On the Mac install Docker/Podman, then run: agent-vm build"); }
  return {spec, directory};
}
export async function buildImage(runtime = "docker") {
  if (!["docker","podman"].includes(runtime)) throw new Error("Use: agent-vm build docker|podman (install and start it on the Mac first).");
  const {execFileSync} = await import("node:child_process");
  const {buildAssets} = await loadGondolin();
  const spec = imageSpec(), output = imageDirectory(spec);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(),"agent-vm-build-"));
  try {
    for (const file of ["Dockerfile","pins.json","guest"]) fs.cpSync(path.join(CONFIG_DIR,file),path.join(scratch,file),{recursive:true});
    fs.writeFileSync(path.join(scratch,"agent-image.json"),JSON.stringify(spec));
    const tag = "agent-vm:"+spec.fingerprint.slice(0,16);
    execFileSync(runtime,["build","--platform",spec.arch === "aarch64" ? "linux/arm64" : "linux/amd64","--build-arg","NODE_IMAGE="+pins.nodeImage,"-t",tag,scratch],{stdio:"inherit"});
    // A failed rebuild must not leave a previous completion marker trusted.
    fs.rmSync(path.join(output,"agent-image.json"),{force:true});
    await buildAssets({arch:spec.arch,distro:"alpine",alpine:{version:pins.alpine},oci:{image:tag,runtime,pullPolicy:"never"},runtimeDefaults:{rootfsMode:"cow"}}, {outputDir:output});
    // This marker is written only after the complete build, and checked again in-guest.
    fs.writeFileSync(path.join(output,"agent-image.json"),JSON.stringify(spec,null,2)+"\n");
    console.log(`Built ${output}`);
  } finally { fs.rmSync(scratch,{recursive:true,force:true}); }
}

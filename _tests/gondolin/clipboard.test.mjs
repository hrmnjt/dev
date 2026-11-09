import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {startClipboard} from "../../gondolin/.config/gondolin/clipboard.mjs";
const exec = promisify(execFile);
const png = Buffer.from("89504e470d0a1a0a0000000049454e44ae426082","hex"); // Transport fixture, not decoder proof.

test("clipboard proxy serves only PNG bytes at one random route; text/paths/writes are refused",async t => {
  const clipboard = await startClipboard(async () => png);t.after(() => clipboard.close());
  const base = `http://127.0.0.1:${clipboard.port}`;
  const response = await fetch(base+clipboard.route);assert.equal(response.headers.get("content-type"),"image/png");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
  for (const route of ["/","/clipboard/text","/etc/passwd",clipboard.route+"?path=/etc/passwd"]) assert.equal((await fetch(base+route)).status,404);
  assert.equal((await fetch(base+clipboard.route,{method:"POST",body:"text"})).status,404);
});

test("non-images and oversized payloads never cross the proxy",async t => {
  for (const data of [Buffer.from("private clipboard text"),Buffer.alloc(10*1024*1024+1)]) {
    const clipboard = await startClipboard(async () => data);t.after(() => clipboard.close());
    const response = await fetch(`http://127.0.0.1:${clipboard.port}${clipboard.route}`);
    assert.equal(response.status,404);assert.equal(await response.text(),"");
  }
});

test("guest xclip/wl-paste adapters return image types/data only, never plain-text requests",async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),"agent-vm-clipboard-"));t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
  const source = path.resolve("gondolin/.config/gondolin/guest/clipboard.mjs");
  const clipboard = await startClipboard(async () => png);t.after(() => clipboard.close());
  const env = {...process.env,AGENT_CLIPBOARD_URL:`http://127.0.0.1:${clipboard.port}${clipboard.route}`};
  for (const name of ["xclip","wl-paste"]) fs.symlinkSync(source,path.join(dir,name));
  const run = (name,args) => exec(process.execPath,[path.join(dir,name),...args],{env,encoding:"buffer"});
  assert.equal((await run("xclip",["-selection","clipboard","-t","TARGETS","-o"])).stdout.toString(),"image/png\n");
  assert.deepEqual((await run("xclip",["-selection","clipboard","-t","image/png","-o"])).stdout,png);
  assert.deepEqual((await run("wl-paste",["--type","image/png"])).stdout,png);
  assert.equal((await run("wl-paste",["-l"])).stdout.toString(),"image/png\n");
  await assert.rejects(run("xclip",["-selection","clipboard","-o"]));
  await assert.rejects(run("wl-paste",["--type","text/plain"]));
});

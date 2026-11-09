// One deliberately narrow host service: fixed AppKit image read, no text, no paths.
import http from "node:http";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
const exec = promisify(execFile);
const PNG = Buffer.from("89504e470d0a1a0a","hex");
const script = `ObjC.import('AppKit'); ObjC.import('Foundation');
const p = $.NSPasteboard.generalPasteboard;
let d = p.dataForType($.NSPasteboardTypePNG);
if (!d || d.isNil()) {
  const t = p.dataForType($.NSPasteboardTypeTIFF);
  if (!t || t.isNil()) throw new Error('No clipboard image');
  const b = $.NSBitmapImageRep.imageRepWithData(t);
  d = b.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary);
}
if (!d || d.isNil() || Number(d.length) > 10485760) throw new Error('No bounded image');
ObjC.unwrap(d.base64EncodedStringWithOptions(0));`;
export async function readClipboardImage() {
  const {stdout} = await exec("/usr/bin/osascript",["-l","JavaScript","-e",script],{timeout:4000,maxBuffer:15*1024*1024,encoding:"utf8"});
  return Buffer.from(stdout.trim(),"base64");
}
export async function startClipboard(readImage = readClipboardImage) {
  const route = "/"+randomBytes(24).toString("hex")+"/image";
  let busy = false;
  const server = http.createServer(async (request,response) => {
    if (request.method !== "GET" || request.url !== route) { response.writeHead(404).end(); return; }
    if (busy) { response.writeHead(429).end(); return; }
    busy = true;
    try {
      const image = await readImage();
      if (!Buffer.isBuffer(image) || image.length > 10*1024*1024 || !image.subarray(0,8).equals(PNG)) throw new Error();
      response.writeHead(200,{"Content-Type":"image/png","Content-Length":image.length,"Cache-Control":"no-store"}).end(image);
    } catch { response.writeHead(404).end(); }
    finally { busy = false; }
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000;
  await new Promise((resolve,reject) => {server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  const port = server.address().port;
  return {port, route, close:() => new Promise(resolve => {server.close(resolve);server.closeAllConnections();})};
}

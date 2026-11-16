import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {test} from "node:test";
import {piSdkRoot} from "./fixtures/sdk.mjs";
const sdk = piSdkRoot();
const require = createRequire(path.join(sdk,"package.json"));
const {createJiti} = require("jiti");
const jiti = createJiti(import.meta.url,{fsCache:false,alias:{"@earendil-works/pi-coding-agent":path.join(sdk,"dist/index.js")}});
const extension = await jiti.import(path.resolve("pi/.pi/agent/extensions/gondolin.ts"));
const {VmOutputs} = await jiti.import(path.resolve("pi/.pi/agent/extensions/lib/vm-output.ts"));
const saved = process.env.AGENT_VM_CONFIG;
process.env.AGENT_VM_CONFIG = path.resolve("_tests/pi/fixtures/gondolin");
process.on("exit",() => {if (saved) process.env.AGENT_VM_CONFIG = saved;else delete process.env.AGENT_VM_CONFIG;});

function fixture() {
  const f = {starts:0,closes:0,calls:[],files:new Map(),shutdown:false,notices:[]};
  globalThis.__gondolinFixture = f;
  const hooks = new Map(), tools = new Map(), commands = new Map();
  extension.default({registerTool:tool => tools.set(tool.name,tool),on:(name,handler) => hooks.set(name,handler),registerCommand:(name,command) => commands.set(name,command)});
  const ctx = {cwd:process.cwd(),sessionManager:{getSessionId:() => "fixture",getSessionFile:() => undefined},ui:{notify:message => f.notices.push(message),setStatus:() => {}},shutdown:() => {f.shutdown = true;}};
  return {...f,state:f,hooks,tools,commands,ctx,call:(name,args) => tools.get(name).execute("fixture",args,undefined,undefined,ctx)};
}

test("VM registration is side-effect free, startup is singleflight and all direct tools delegate",async () => {
  const f = fixture();assert.equal(f.state.starts,0);assert.equal(f.hooks.has("user_bash"),false);
  await Promise.all([f.hooks.get("session_start")({},f.ctx),f.hooks.get("tool_call")({toolName:"read"},f.ctx)]);
  assert.equal(f.state.starts,1);assert.equal(f.state.options.agent,"pi");
  assert.ok(f.state.options.resources["/pi/docs"]);
  await f.call("write",{path:"vm-fixture.txt",content:"guest"});
  assert.equal(fs.existsSync("vm-fixture.txt"),false,"write must not reach host filesystem");
  const read = await f.call("read",{path:"vm-fixture.txt"});assert.equal(read.content[0].text,"guest");
  await f.call("edit",{path:"vm-fixture.txt",edits:[{oldText:"guest",newText:"edited"}]});
  assert.equal((await f.call("read",{path:"vm-fixture.txt"})).content[0].text,"edited");
  const bash = await f.call("bash",{command:"python -m pip --version"});assert.equal(bash.structuredContent.exit_code,0,"retired uv guard must not return");
  const denied = await f.hooks.get("tool_call")({toolName:"powershell"},f.ctx);assert.equal(denied.block,true);
  assert.equal((await f.hooks.get("tool_call")({toolName:"wal_append"},f.ctx)).block,true);
  const prompt = await f.hooks.get("before_agent_start")({systemPrompt:"base"},f.ctx);assert.match(prompt.systemPrompt,/Gondolin VM/);
  await f.hooks.get("session_shutdown")({},f.ctx);await f.hooks.get("session_shutdown")({},f.ctx);
  assert.equal(f.state.closes,1);
  await assert.rejects(f.call("bash",{command:"true"}),/stopped/);
});

test("shutdown during startup aborts initialization and closes a late VM exactly once",async () => {
  const gate = Promise.withResolvers(), entered = Promise.withResolvers(), f = fixture();
  f.state.startGate = gate.promise;f.state.startEntered = entered;
  const starting = f.hooks.get("session_start")({},f.ctx);
  const options = await entered.promise;
  const stopped = f.hooks.get("session_shutdown")({},f.ctx);
  assert.equal(options.signal.aborted,true);
  gate.resolve();await Promise.all([starting,stopped]);
  assert.equal(f.state.closes,1);assert.equal(f.state.shutdown,true);
});

test("failed startup shuts down, caches failure and never uses local built-ins",async () => {
  const f = fixture();f.state.failure = true;
  await f.hooks.get("session_start")({},f.ctx);assert.equal(f.state.shutdown,true);
  for (const name of ["read","write","edit","bash"]) await assert.rejects(f.call(name,{path:"no-host",command:"true",content:"no",edits:[]}),/Pinned image missing/);
  assert.equal(f.state.starts,1);assert.equal(f.state.calls.length,0);assert.equal(fs.existsSync("no-host"),false);
  await f.hooks.get("session_shutdown")({},f.ctx);
});

test("real SDK bash overflow uses guest paths in model/codemode results and owns cleanup",async () => {
  const f = fixture();f.state.output = "a".repeat(1200000);
  const result = await f.call("bash",{command:"synthetic large output"});
  const guest = result.structuredContent.full_output_path;
  assert.match(guest,/^\/pi-output\/pi-bash-[a-f0-9]+\.log$/);
  assert.equal(result.details.fullOutputPath,guest);
  const host = path.join(f.state.options.outputDirectory,path.basename(guest));
  assert.equal(fs.statSync(host).size,1200000);
  assert.ok(result.content[0].text.includes(guest));
  assert.equal(result.structuredContent.truncated,true);
  // The runtime mounts this private directory read-only, not all of host TMPDIR.
  await f.hooks.get("session_shutdown")({},f.ctx);assert.equal(fs.existsSync(host),false);
});

test("guest-home normalization, supported images and bounded regular-file reads",async () => {
  const f = fixture();
  await f.call("write",{path:"~/fixture.txt",content:"guest home"});
  assert.ok(f.state.files.has("/home/agent/fixture.txt"));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==","base64");
  f.state.files.set("/home/agent/fixture.png",png);
  const result = await f.call("read",{path:"~/fixture.png"});
  assert.ok(result.content.some(block => block.type === "image"));
  f.state.nonregular = true;
  await assert.rejects(f.call("read",{path:"~/fixture.txt"}),/regular guest file/);
  f.state.nonregular = false;f.state.sizeOverride = 64*1024*1024+1;
  await assert.rejects(f.call("read",{path:"~/fixture.txt"}),/64 MiB/);
  await f.hooks.get("session_shutdown")({},f.ctx);
});

test("overflow bridge rejects arbitrary host files and symlink/hardlink aliases",() => {
  const bridge = new VmOutputs();
  const ordinary = path.join(os.tmpdir(),"agent-vm-not-sdk-"+process.pid);
  const symbolic = path.join(os.tmpdir(),`pi-bash-symlink-${process.pid}.log`);
  const hard = path.join(os.tmpdir(),`pi-bash-hardlink-${process.pid}.log`);
  fs.writeFileSync(ordinary,"fixture");fs.symlinkSync(ordinary,symbolic);fs.linkSync(ordinary,hard);
  try {
    for (const file of [ordinary,symbolic,hard]) assert.throws(() => bridge.expose({content:[],details:{fullOutputPath:file}}),/non-SDK/);
    bridge.dispose();assert.equal(fs.readFileSync(ordinary,"utf8"),"fixture");
  } finally {bridge.dispose();for (const file of [symbolic,hard,ordinary]) fs.unlinkSync(file);}
});

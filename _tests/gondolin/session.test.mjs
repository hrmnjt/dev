import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {test} from "node:test";
import {execFileSync,spawnSync} from "node:child_process";
import * as sdk from "../../gondolin/.config/gondolin/node_modules/@earendil-works/gondolin/dist/src/index.js";
import {createSession} from "../../gondolin/.config/gondolin/session.mjs";
import {imageSpec} from "../../gondolin/.config/gondolin/image.mjs";
import {launchOptions} from "../../gondolin/.config/gondolin/cli.mjs";
import {loadGondolin} from "../../gondolin/.config/gondolin/sdk.mjs";

function mock(t,{failCreate = false,failProbe = false,startupOutput} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),"agent-vm-session-"));
  fs.mkdirSync(path.join(root,"workspace"));
  execFileSync("git",["init","-q",path.join(root,"workspace")]);
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const calls = [], specs = [];let closed = 0, clipboardClosed = 0, nextResult = null;
  const vm = {id:"fixture-vm",fs:{readFile:async () => JSON.stringify({fingerprint:"fixture"})},
    exec(command,opts) {
      calls.push({command,opts});
      const result = nextResult ?? {exitCode:failProbe ? 1:0,...startupOutput?.(specs.at(-1))};nextResult = null;
      return {then:(resolve,reject) => Promise.resolve(result).then(resolve,reject),async *output() {opts?.signal?.throwIfAborted();yield {data:Buffer.from("guest-output")};}};
    },
    close:async () => {closed++;}, setIngressRoutes:routes => {calls.push({routes});},
    enableIngress:async options => {calls.push({ingress:options});return {host:"127.0.0.1",port:4567};},
  };
  return {root,calls,specs,set nextResult(value){nextResult = value;},get closed(){return closed;},get clipboardClosed(){return clipboardClosed;},deps:{
    requireImage:() => ({spec:{fingerprint:"fixture"},directory:"/explicit/pinned/image"}),
    keychainValue:name => ({github:"github_pat_fake-real",claude:"sk-ant-oat01-fake-real",amp:"sgamp_fake-real"}[name]),
    stateRoot:path.join(root,"state"),
    startClipboard:async () => ({port:9876,route:"/image-fixture",close:async () => {clipboardClosed++;}}),
    sdk:{...sdk,VM:{create:async options => {specs.push(options);if (failCreate) throw new Error("untrusted upstream failure");return vm;}}},
  }};
}

test("one explicit VM per session, exact mounts, guest-only bash, loopback opt-in previews and cleanup",async t => {
  const f = mock(t);
  const session = await createSession({agent:"claude",cwd:path.join(f.root,"workspace"),preview:3000},f.deps);
  const spec = f.specs[0];assert.equal(f.specs.length,1);
  assert.equal(spec.sandbox.imagePath,"/explicit/pinned/image");assert.equal(spec.rootfs.mode,"cow");assert.equal(spec.ssh,undefined);
  assert.equal(spec.sandbox.debug,false);assert.equal(spec.debugLog,null);
  assert.equal(spec.sessionLabel,"claude workspace");
  assert.equal(spec.env.CLAUDE_CODE_OAUTH_TOKEN.startsWith("sk-ant-oat01-"),true);
  assert.notEqual(spec.env.CLAUDE_CODE_OAUTH_TOKEN,"sk-ant-oat01-fake-real");
  assert.equal(spec.env.SSH_AUTH_SOCK,undefined);
  assert.deepEqual(spec.tcp.hosts,{"clipboard.agent.internal:18765":"127.0.0.1:9876"});
  assert.ok(!Object.keys(spec.vfs.mounts).includes(os.homedir()));
  assert.equal(spec.vfs.mounts["/etc/agent-config"].readonly,true);
  assert.ok(f.calls.some(c => c.command?.[0] === "/usr/bin/bindfs"));
  assert.deepEqual(f.calls.find(c => c.routes).routes,[{prefix:"/",port:3000,stripPrefix:true}]);
  assert.deepEqual(f.calls.find(c => c.ingress).ingress,{listenHost:"127.0.0.1",listenPort:0});
  let text = "";
  const result = await session.bash("printf guest",session.project.cwd,{onData:b => {text += b;},env:{ANTHROPIC_API_KEY:"must-not-forward"}});
  assert.equal(text,"guest-output");assert.equal(result.exitCode,0);
  const command = f.calls.at(-1);assert.equal(command.command[0],"/usr/local/bin/agent-enter");
  assert.equal(command.opts.env.ANTHROPIC_API_KEY,undefined);
  await session.close();await session.close();assert.equal(f.closed,1);assert.equal(f.clipboardClosed,1);
});

test("Amp bypass lives in read-only VM-only settings, never the Mac default settings file",async t => {
  const f = mock(t);
  assert.equal(fs.existsSync("amp/.config/amp/settings.json"),false);
  const session = await createSession({agent:"amp",cwd:path.join(f.root,"workspace")},f.deps);
  const config = f.specs[0].vfs.mounts["/etc/agent-config"];
  const handle = await config.open("/amp/settings.json","r");
  let settings;
  try {settings = JSON.parse(Buffer.from(await handle.readFile()).toString("utf8"));} finally {await handle.close();}
  assert.equal(settings["amp.dangerouslyAllowAll"],true);
  assert.equal(settings["amp.updates.mode"],"disabled");
  await assert.rejects(async () => config.open("/amp/settings.json","w"),error => Math.abs(error.errno) === 30);
  assert.ok(f.specs[0].env.AMP_API_KEY.startsWith("sgamp_"));
  await session.close();
});

test("Pi gets docs and output mount but no clipboard service, preview or host environment",async t => {
  const f = mock(t);
  const session = await createSession({agent:"pi",cwd:path.join(f.root,"workspace"),resources:{"/pi/docs":f.root},outputDirectory:f.root},f.deps);
  const spec = f.specs[0];assert.equal(spec.tcp,undefined);
  assert.equal(spec.env.AMP_API_KEY,undefined);assert.equal(spec.env.CLAUDE_CODE_OAUTH_TOKEN,undefined);
  assert.equal(spec.vfs.mounts["/pi-output"].readonly,true);
  assert.equal(spec.vfs.mounts["/pi/docs"].readonly,true);
  assert.ok(!f.calls.some(c => c.ingress));
  assert.equal(fs.existsSync(path.join(session.state,"claude-state")),false,"only Claude state is seeded");
  await session.close();
});

test("bindfs tolerates Gondolin's binds, Git excludes are read-only and Claude state is seeded once",async t => {
  const f = mock(t), cwd = path.join(f.root,"workspace");
  const session = await createSession({agent:"claude",cwd},f.deps);
  const binds = f.calls.filter(c => c.command?.[0] === "/usr/bin/bindfs");
  assert.ok(binds.length > 0 && binds.every(c => c.command.includes("allow_other,nonempty")));
  // The macOS image build drops setuid bits; boot restores the recorded modes,
  // and apt/debconf keep /var/cache and /var/log on the disposable root disk.
  const restore = f.calls.findIndex(c => c.command?.[2]?.includes("< /etc/agent-image-modes"));
  assert.ok(restore > f.calls.indexOf(binds.at(-1)) && !f.calls[restore].command.includes("/usr/local/bin/agent-enter"));
  assert.deepEqual(f.specs[0].tmpfs,{"/tmp":{},"/var/tmp":{},"/root":{mode:"0700"}});
  const hostnameSetup = f.calls.find(c => c.command?.[2]?.startsWith("hostname "));
  assert.match(hostnameSetup.command[2],/^hostname claude-vm && .*localhost.*127\.0\.1\.1\\t%s\\n' claude-vm >> \/etc\/hosts$/);
  const config = f.specs[0].vfs.mounts["/etc/agent-config"];
  const read = async file => {const handle = await config.open(file,"r");try {return Buffer.from(await handle.readFile()).toString("utf8");} finally {await handle.close();}};
  assert.match(await read("/gitconfig"),/excludesFile = \/etc\/agent-config\/gitignore/);
  assert.equal(await read("/gitignore"),fs.readFileSync("git/.config/git/ignore","utf8"));
  await assert.rejects(async () => config.open("/gitignore","w"),error => Math.abs(error.errno) === 30);
  const claudeState = path.join(session.state,"claude-state"), seeded = path.join(claudeState,".claude.json");
  assert.deepEqual(JSON.parse(fs.readFileSync(seeded,"utf8")),{hasCompletedOnboarding:true});
  await session.close();
  fs.writeFileSync(seeded,'{"numStartups":3}');
  await (await createSession({agent:"claude",cwd},f.deps)).close();
  assert.equal(fs.readFileSync(seeded,"utf8"),'{"numStartups":3}',"Claude's own state is never overwritten");
  // The guest can replace its state directory; the host must not follow it.
  fs.rmSync(claudeState,{recursive:true});fs.symlinkSync(f.root,claudeState);
  await assert.rejects(createSession({agent:"claude",cwd},f.deps),/must not be a symlink/);
  assert.equal(fs.existsSync(path.join(f.root,".claude.json")),false);
});

test("guest clock follows the Mac from boot and, for Claude and Amp, through Mac sleep",async t => {
  t.mock.timers.enable({apis:["setInterval"]});
  const syncs = f => f.calls.filter(c => c.command?.[0] === "/bin/date");
  const settle = () => new Promise(resolve => setImmediate(resolve));
  for (const agent of ["claude","amp","pi"]) {
    const f = mock(t);
    const session = await createSession({agent,cwd:path.join(f.root,"workspace")},f.deps);
    const [boot] = syncs(f);
    assert.equal(f.calls.indexOf(boot),0,"the clock is set before any other guest command");
    assert.deepEqual(boot.command.slice(0,3),["/bin/date","-u","-s"]);assert.equal(boot.opts?.env,undefined);
    assert.ok(Math.abs(Number(boot.command[3].slice(1))-Date.now()/1000) < 5);
    t.mock.timers.tick(30_000);await settle();
    // Pi's idle VM is paused and re-synced by Gondolin; polling would keep waking it.
    const expected = agent === "pi" ? 1:2;assert.equal(syncs(f).length,expected,agent);
    await session.close();t.mock.timers.tick(60_000);await settle();
    assert.equal(syncs(f).length,expected,"no sync after close");
  }
});

test("Pi file writes run as the guest's non-root user and report guest errors",async t => {
  const f = mock(t);
  const session = await createSession({agent:"pi",cwd:path.join(f.root,"workspace")},f.deps);
  await session.mkdir("/tmp/fixture dir");await session.writeFile("/tmp/fixture dir/a.txt","guest text");
  const [mkdir,write] = f.calls.slice(-2);
  assert.deepEqual(mkdir.command,["/usr/local/bin/agent-enter","/bin/mkdir","-p","--","/tmp/fixture dir"]);
  assert.deepEqual(write.command.slice(0,2),["/usr/local/bin/agent-enter","/bin/sh"]);assert.equal(write.command.at(-1),"/tmp/fixture dir/a.txt");
  assert.equal(write.opts.stdin.toString(),"guest text");assert.equal(write.opts.env.HOME,"/home/agent");
  f.nextResult = {exitCode:1,stderr:"sh: 1: cannot create /etc/fixture: Permission denied\n"};
  await assert.rejects(session.writeFile("/etc/fixture","no"),/Guest write failed: sh: 1: cannot create/);
  f.nextResult = {exitCode:1,stderr:""};
  await assert.rejects(session.mkdir("/etc/fixture"),/Guest mkdir failed: exit 1/);
  await session.close();
});

test("setup-token is a throwaway VM with no mounts, state, supplied credentials or clipboard",async t => {
  const f = mock(t);
  f.deps.keychainValue = () => {throw new Error("setup-token must not read Keychain");};
  const session = await createSession({agent:"claude",setupToken:true},f.deps);
  // No host mounts, but a VFS so Gondolin can inject its TLS interception CA.
  assert.deepEqual(f.specs[0].vfs.mounts,{});assert.equal(f.specs[0].tcp,undefined);
  assert.ok(!f.calls.some(c => c.command?.[0] === "/usr/bin/bindfs"));
  assert.equal(f.specs[0].env.GH_TOKEN,undefined);assert.equal(session.state,undefined);
  assert.equal(fs.existsSync(path.join(f.root,"state")),false);await session.close();
});

test("missing image stops before credentials/VM and failed boot/probes clean up with no fallback",async t => {
  const f = mock(t);
  let reads = 0;f.deps.keychainValue = () => {reads++;};
  f.deps.requireImage = () => {throw new Error("Pinned image missing; run agent-vm build");};
  await assert.rejects(createSession({agent:"pi"},f.deps),/agent-vm build/);
  assert.equal(reads,0);assert.equal(f.specs.length,0);
  for (const mode of ["failCreate","failProbe"]) {
    const g = mock(t,{[mode]:true});
    await assert.rejects(createSession({agent:"claude",cwd:path.join(g.root,"workspace")},g.deps),/Gondolin launch failed|Guest initialization failed/);
    assert.equal(g.clipboardClosed,1);assert.equal(g.closed,mode === "failCreate" ? 0:1);
  }
});

test("initialization failure identifies its stage and bounds, escapes and redacts guest output",async t => {
  const tail = "\nfixture output tail\n";
  const f = mock(t,{failProbe:true,startupOutput:spec => ({
    stderr:"fixture mount failure\ngithub_pat_fake-real\nsk-ant-oat01-fake-real\n"+spec.env.GH_TOKEN+"\n"+spec.env.CLAUDE_CODE_OAUTH_TOKEN+"\u001b]52;c;fixture\u0007",
    // The real token straddles the unredacted 4096-character tail boundary.
    stdout:"x".repeat(10000)+"github_pat_fake-real"+"y".repeat(4096-tail.length-9)+tail,
  })});
  await assert.rejects(createSession({agent:"claude",cwd:path.join(f.root,"workspace")},f.deps),error => {
    assert.match(error.message,/Guest initialization failed during "guest clock sync" \(exit 1; no host fallback/);
    assert.match(error.message,/stderr:.*fixture mount failure/);assert.match(error.message,/stdout:.*fixture output tail/);
    assert.match(error.message,/\[truncated\]/);assert.match(error.message,/\[redacted\]/);
    for (const token of ["github_pat_fake-real","sk-ant-oat01-fake-real",f.specs[0].env.GH_TOKEN,f.specs[0].env.CLAUDE_CODE_OAUTH_TOKEN]) assert.ok(!error.message.includes(token));
    assert.ok(!error.message.includes("fake-real"),"No token fragment may survive truncation");
    assert.doesNotMatch(error.message,/[\u001b\u0007]/);assert.ok(error.message.length < 9000);
    return true;
  });
  assert.equal(f.closed,1);assert.equal(f.clipboardClosed,1);
});

test("SDK dependency resolution uses the explicit deployment prefix, not Stow's source directory",async t => {
  const f = mock(t);
  const prefix = path.join(f.root,"deployed-config");fs.mkdirSync(prefix);
  fs.symlinkSync(path.resolve("gondolin/.config/gondolin/package.json"),path.join(prefix,"package.json"));
  fs.symlinkSync(path.resolve("gondolin/.config/gondolin/node_modules"),path.join(prefix,"node_modules"));
  const installed = await loadGondolin(prefix);assert.equal(installed.VM,sdk.VM);
  await assert.rejects(loadGondolin(path.join(f.root,"missing")),/npm ci --prefix/);
});

test("Stow simulation excludes npm runtime state and the package README",t => {
  const f = mock(t), packages = path.join(f.root,"packages"), target = path.join(f.root,"target");
  const source = path.join(packages,"gondolin");fs.mkdirSync(path.join(source,".config/gondolin/node_modules/example"),{recursive:true});fs.mkdirSync(target);
  fs.copyFileSync("gondolin/.stow-local-ignore",path.join(source,".stow-local-ignore"));
  fs.writeFileSync(path.join(source,".config/gondolin/node_modules/example/index.js"),"runtime");
  fs.writeFileSync(path.join(source,".config/gondolin/cli.mjs"),"launcher");fs.writeFileSync(path.join(source,"README.md"),"guide");
  const result = spawnSync("stow",["--simulate","--verbose=1","--no-folding","-d",packages,"-t",target,"gondolin"],{encoding:"utf8"});
  if (result.error?.code === "ENOENT") {t.skip("Stow unavailable");return;}
  assert.equal(result.status,0,result.stderr);assert.match(result.stderr,/cli\.mjs/);
  assert.doesNotMatch(result.stderr,/node_modules|README/);assert.deepEqual(fs.readdirSync(target),[]);
});

test("already-cancelled startup never reads credentials or starts a VM",async t => {
  const f = mock(t), controller = new AbortController();controller.abort();
  let reads = 0;f.deps.keychainValue = () => {reads++;};
  await assert.rejects(createSession({agent:"pi",signal:controller.signal},f.deps),/aborted/i);
  assert.equal(reads,0);assert.equal(f.specs.length,0);
});

test("image identity is pinned and command publication is opt-in",() => {
  assert.deepEqual(imageSpec(),imageSpec());
  // The official Node base already owns UID/GID 1000. This is a source
  // regression check, not a substitute for the pending real image build.
  const recipe = fs.readFileSync("gondolin/.config/gondolin/Dockerfile","utf8");
  assert.match(recipe,/usermod --login agent/);assert.match(recipe,/groupmod --new-name agent node/);
  assert.doesNotMatch(recipe,/useradd.*--uid 1000/);
  assert.match(recipe,/-perm \/7022 -printf '%m\\t%p\\n' > \/etc\/agent-image-modes/);
  assert.match(recipe,/"4755" && \$2 == "\/usr\/bin\/sudo"/);
  assert.match(imageSpec().pins.nodeImage,/@sha256:[a-f0-9]{64}$/);
  assert.deepEqual(launchOptions(["--preview","3000","--","-p","fixture"]),{preview:3000,args:["-p","fixture"]});
  assert.deepEqual(launchOptions(["-p","fixture"]),{preview:undefined,args:["-p","fixture"]});
});

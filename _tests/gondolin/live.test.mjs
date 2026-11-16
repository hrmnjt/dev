// Deliberate host-only integration test. No real credentials or upstream writes.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {test} from "node:test";
import {createSession} from "../../gondolin/.config/gondolin/session.mjs";
import {quote} from "../../gondolin/.config/gondolin/policy.mjs";

// Needs public internet; it sends no credentials.
const trustsHttps = `curl -sSfo /dev/null https://example.com && node -e 'fetch("https://example.com").then(r => process.exit(r.ok ? 0 : 1), e => {console.error(e.cause ?? e);process.exit(1);})'`;

test("live QEMU: non-root tools, linked mounts, locked paths, overflow mount, cancellation and cleanup",{skip:process.env.AGENT_VM_LIVE_TEST !== "1" && "Run on the Mac after agent-vm build with AGENT_VM_LIVE_TEST=1"},async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),"agent-vm-live-"));
  const primary = path.join(root,"primary"), linked = path.join(root,"linked"), output = path.join(root,"outputs");
  const git = (cwd,...args) => execFileSync("git",["-C",cwd,...args],{env:{PATH:process.env.PATH,HOME:root,GIT_CONFIG_GLOBAL:"/dev/null",GIT_CONFIG_NOSYSTEM:"1"},encoding:"utf8"});
  fs.mkdirSync(primary);git(primary,"init","-q");
  git(primary,"-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","--allow-empty","-qm","fixture");
  git(primary,"worktree","add","-qb","test-vm",linked);
  for (const dir of [".pi",".claude","_models"]) fs.mkdirSync(path.join(linked,dir));
  fs.writeFileSync(path.join(linked,".pi/policy"),"locked");
  fs.mkdirSync(output);fs.writeFileSync(path.join(output,"fixture.log"),"host-owned-output\n");
  let session;
  t.after(async () => {try {await session?.close();} finally {fs.rmSync(root,{recursive:true,force:true});}});
  const before = Date.now();
  session = await createSession({agent:"pi",cwd:linked,outputDirectory:output},{stateRoot:path.join(root,"state"),keychainValue:() => "github_pat_synthetic-never-sent"});
  const bash = async command => {let output = "";const result = await session.bash(command,session.project.cwd,{onData:b => {output += b;}});return {...result,output};};
  assert.equal((await bash("id -u")).output.trim(),"1000");
  assert.equal((await bash("printf live > live.txt && git config fixture.allowed yes && git status --short")).exitCode,0);
  assert.equal(fs.readFileSync(path.join(linked,"live.txt"),"utf8"),"live");
  assert.equal(git(linked,"config","fixture.allowed").trim(),"yes");
  assert.notEqual((await bash("git var GIT_AUTHOR_IDENT")).exitCode,0,"unknown primary path must not acquire an identity");
  for (const target of [".pi/policy",".claude/settings.json",path.join(session.project.common,"hooks/pre-commit"),"/etc/agent-config/gitconfig","/pi-output/fixture.log"]) {
    assert.notEqual((await bash(`printf unsafe > ${quote(target)}`)).exitCode,0,target);
    await assert.rejects(session.vm.fs.writeFile(path.posix.resolve(session.project.cwd,target),"unsafe"));
  }
  assert.notEqual((await bash("mv .pi moved-config")).exitCode,0);
  // Guest root is available to the agent, but host-side protections still apply to it.
  assert.equal((await bash("stat -c %a /usr/bin/sudo")).output.trim(),"4755","boot restores setuid modes");
  assert.equal((await bash("sudo -n id -u 2>&1")).output.trim(),"0","sudo works without hostname warnings");
  assert.equal((await bash("hostname")).output.trim(),"pi-vm");
  assert.match((await bash("getent ahostsv4 localhost")).output,/^127\.0\.0\.1\s/,"localhost resolves locally");
  // Gondolin's intercepted certificates tolerate only five minutes of guest clock lag.
  const skew = Number((await bash("date +%s.%N")).output)-Date.now()/1000;assert.ok(Math.abs(skew) < 2,`guest clock skew ${skew}s`);
  // Gondolin intercepts guest HTTPS; Node (agents, npm) and curl must trust its CA as UID 1000.
  const https = await bash(trustsHttps);assert.equal(https.exitCode,0,https.output);
  assert.equal((await bash("test -d /var/cache/apt && test -d /var/cache/debconf")).exitCode,0,"apt/debconf state is not hidden by tmpfs");
  for (const target of [".pi/policy",path.join(session.project.common,"hooks/pre-commit"),"/etc/agent-config/gitconfig"]) {
    assert.notEqual((await bash(`sudo -n sh -c ${quote(`printf unsafe > ${quote(target)}`)} 2>/dev/null`)).exitCode,0,"root: "+target);
  }
  assert.equal(fs.readFileSync(path.join(linked,".pi/policy"),"utf8"),"locked");
  // Pi's write tool creates agent-owned files; host global excludes apply to guest Git.
  await session.writeFile("/tmp/pi-write.txt","pi");
  assert.equal((await bash("stat -c %u /tmp/pi-write.txt && rm /tmp/pi-write.txt")).output.trim(),"1000");
  assert.equal((await bash("git check-ignore -q editor.swp")).exitCode,0);
  assert.notEqual((await bash("cat _models/anything")).exitCode,0);
  assert.equal((await bash("cat /pi-output/fixture.log")).output,"host-owned-output\n");
  assert.equal(await session.vm.fs.readFile("/pi-output/fixture.log",{encoding:"utf8"}),"host-owned-output\n");
  await assert.rejects(session.bash("sleep 10",session.project.cwd,{timeout:0.05}),/timeout/);
  assert.equal((await bash("printf survived")).output,"survived");
  console.log(`VM startup plus fixture checks: ${Date.now()-before} ms; memory budget configured in gondolin/config.json (measure RSS separately).`);
  await session.close();await session.close();
  // setup-token mounts no host path but still needs Gondolin's CA for its OAuth flow.
  const setup = await createSession({agent:"claude",setupToken:true},{keychainValue:() => {throw new Error("setup-token must not read Keychain");}});
  try {
    let output = "";const result = await setup.bash(`${trustsHttps} && test ! -e ${quote(linked)}`,"/home/agent",{onData:b => {output += b;}});
    assert.equal(result.exitCode,0,output);
  } finally {await setup.close();}
});

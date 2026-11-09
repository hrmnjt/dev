import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {test} from "node:test";
import {projectInfo,globalGitConfig,guestEnv,providerGuard,agentCommand,parsePreview} from "../../gondolin/.config/gondolin/policy.mjs";
import {secretDefinitions,credentialStatus} from "../../gondolin/.config/gondolin/credentials.mjs";
import {createHttpHooks,RealFSProvider,SandboxVfsProvider} from "../../gondolin/.config/gondolin/node_modules/@earendil-works/gondolin/dist/src/index.js";

function fixture(t) {
  // macOS TMPDIR (/var/folders) is a symlink; the policy compares canonical paths.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"agent-vm-policy-")));
  t.after(() => fs.rmSync(dir,{recursive:true,force:true}));return dir;
}
function git(cwd,...args) {return execFileSync("git",["-C",cwd,...args],{encoding:"utf8",env:{PATH:process.env.PATH,HOME:cwd,GIT_CONFIG_GLOBAL:"/dev/null",GIT_CONFIG_NOSYSTEM:"1"},stdio:["ignore","pipe","pipe"]}).trim();}

test("personal/work/unknown identity and external linked worktrees select by common directory",t => {
  const home = fixture(t);
  fs.mkdirSync(path.join(home,".config/git"),{recursive:true});
  fs.writeFileSync(path.join(home,".config/git/config.personal"),'[user]\nname = Personal Fixture\nemail = personal@example.invalid\n');
  fs.writeFileSync(path.join(home,".config/git/config.work"),'[user]\nname = Work Fixture\nemail = work@example.invalid\n');
  for (const [relative,name] of [["code/github.com/hrmnjt/repo","Personal Fixture"],["code/work/repo","Work Fixture"],["unknown/repo",null]]) {
    const repo = path.join(home,relative);fs.mkdirSync(repo,{recursive:true});git(repo,"init","-q");
    git(repo,"-c","user.name=fixture","-c","user.email=fixture@example.invalid","commit","--allow-empty","-qm","initial");
    const linked = path.join(home,"elsewhere",name ?? "unknown");git(repo,"worktree","add","-qb","linked",linked);
    for (const cwd of [repo,linked]) {
      const info = projectInfo(cwd,home);
      assert.equal(info.identity?.name ?? null,name);
      assert.equal(info.primary,path.join(repo,".git"));
      assert.equal(info.key,projectInfo(repo,home).key);
      const config = path.join(home,"guest-gitconfig");fs.writeFileSync(config,globalGitConfig(info.identity));
      const command = () => execFileSync("git",["-C",cwd,"var","GIT_AUTHOR_IDENT"],{encoding:"utf8",env:{PATH:process.env.PATH,HOME:home,GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:config},stdio:["ignore","pipe","pipe"]});
      if (name) assert.match(command(),new RegExp(name));else assert.throws(command,/no (name|email) was given/);
    }
  }
  fs.unlinkSync(path.join(home,".config/git/config.personal"));
  assert.throws(() => projectInfo(path.join(home,"code/github.com/hrmnjt/repo"),home),/no fallback/);
});

test("launching from home, its ancestors or credential directories is refused",t => {
  assert.throws(() => projectInfo(os.homedir()),/dedicated project/);
  assert.throws(() => projectInfo(path.parse(os.homedir()).root),/dedicated project/);
  const home = fs.mkdtempSync(path.join(os.tmpdir(),"agent-vm-private-home-"));t.after(() => fs.rmSync(home,{recursive:true,force:true}));
  fs.mkdirSync(path.join(home,".ssh"));
  assert.throws(() => projectInfo(path.join(home,".ssh"),home),/dedicated project/);
});

test("guest env is an allowlist: no host tokens, SSH agent, proxies or identity overrides",() => {
  const env = guestEnv({GH_TOKEN:"github_pat_fixture-placeholder"},{TERM:"xterm-test",TERM_PROGRAM:"rex",REX_SOCKET:"/private/socket",SSH_AUTH_SOCK:"private",ANTHROPIC_API_KEY:"private",GIT_AUTHOR_NAME:"wrong",BASH_ENV:"evil",HTTPS_PROXY:"evil"});
  for (const key of ["SSH_AUTH_SOCK","ANTHROPIC_API_KEY","GIT_AUTHOR_NAME","BASH_ENV","HTTPS_PROXY","REX_SOCKET"]) assert.equal(env[key],undefined);
  assert.equal(env.TERM_PROGRAM,"rex");assert.equal(env.GIT_CONFIG_VALUE_0,"true");assert.equal(env.AMP_FORCE_BEL,"1");
  // Node trusts Gondolin's CA through the world-readable runtime bundle, not the root-only mount.
  assert.equal(env.NODE_EXTRA_CA_CERTS,"/run/gondolin/ca-certificates.crt");
  assert.match(globalGitConfig(null),/insteadOf = git@github.com:/);
  assert.match(globalGitConfig(null),/password=\$GH_TOKEN/);
  // Host Git behaviour carried into the guest: global excludes and conflict style.
  assert.match(globalGitConfig(null),/excludesFile = \/etc\/agent-config\/gitignore/);
  assert.match(globalGitConfig(null),/conflictStyle = zdiff3/);assert.match(globalGitConfig(null),/\[rerere\]\n\tenabled = true/);
});

test("guest credential helper survives Git config parsing and returns the placeholder",t => {
  // Unquoted `;` starts a Git config comment and bare quotes are stripped.
  const config = path.join(fixture(t),"guest-gitconfig");fs.writeFileSync(config,globalGitConfig(null));
  const output = execFileSync("git",["credential","fill"],{encoding:"utf8",input:"protocol=https\nhost=github.com\n\n",
    env:{PATH:process.env.PATH,HOME:path.dirname(config),GIT_CONFIG_GLOBAL:config,GIT_CONFIG_NOSYSTEM:"1",GIT_TERMINAL_PROMPT:"0",GH_TOKEN:"github_pat_fixture-placeholder"},stdio:["pipe","pipe","pipe"]});
  assert.match(output,/^username=x-access-token$/m);assert.match(output,/^password=github_pat_fixture-placeholder$/m);
});

test("real Gondolin provider rejects config/hook mutations, symlink and hardlink aliases and protected ancestor moves",async t => {
  const root = fixture(t);
  for (const dir of ["project/.pi","project/.claude","project/.git/hooks","project/sub","project/_models"]) fs.mkdirSync(path.join(root,dir),{recursive:true});
  for (const file of ["project/.pi/policy","project/.claude/settings.json","project/.git/hooks/pre-commit","project/.git/config","project/_models/model","project/normal"]) fs.writeFileSync(path.join(root,file),"before");
  fs.symlinkSync(".pi",path.join(root,"project/alias"));
  fs.linkSync(path.join(root,"project/.pi/policy"),path.join(root,"project/hardlink"));
  const project = path.join(root,"project");
  const provider = new SandboxVfsProvider(new RealFSProvider(project),{before:providerGuard(project,{hidden:[path.join(project,"_models")],gitCommon:path.join(project,".git")})});
  const write = async file => {const handle = await provider.open(file,"w");await handle.writeFile("changed");await handle.close();};
  await write("/normal");await write("/.git/config");
  for (const p of ["/.pi/policy","/.claude/settings.json","/.git/hooks/pre-commit","/alias/policy","/hardlink"]) await assert.rejects(write(p),/read-only|Hard-linked/);
  await assert.rejects(provider.rename("/.pi","/moved"),/read-only/);
  await assert.rejects(provider.rename("/","/moved"),/protected ancestor/);
  await assert.rejects(provider.link("/.pi/policy","/another"),/read-only/);
  await assert.rejects(provider.open("/_models/model","r"),/not exposed/);
  assert.equal(fs.readFileSync(path.join(project,".pi/policy"),"utf8"),"before");
  const common = new SandboxVfsProvider(new RealFSProvider(path.join(project,".git")),{before:providerGuard(path.join(project,".git"),{gitCommon:path.join(project,".git")})});
  await assert.rejects(common.open("/hooks/pre-commit","w"),/read-only/);
  assert.equal(fs.readFileSync(path.join(project,".git/hooks/pre-commit"),"utf8"),"before");
});

test("secrets are host-scoped, including Basic auth and redirected real credentials",async () => {
  const definitions = secretDefinitions("claude",name => ({github:"github_pat_fake-real",claude:"sk-ant-oat01-fake-real"}[name]));
  assert.deepEqual(definitions.CLAUDE_CODE_OAUTH_TOKEN.hosts,["api.anthropic.com"]);
  const {httpHooks,env} = createHttpHooks({secrets:{GH_TOKEN:{value:"github_pat_fake-real",hosts:["github.com","api.github.com"],placeholder:"github_pat_fake-placeholder"}},blockInternalRanges:true});
  const request = url => new Request(url,{headers:{Authorization:"Basic "+Buffer.from("x-access-token:"+env.GH_TOKEN).toString("base64")}});
  const rewritten = await httpHooks.onRequest(request("https://github.com/fixture/repo.git"));
  assert.equal(Buffer.from(rewritten.headers.get("Authorization").slice(6),"base64").toString(),"x-access-token:github_pat_fake-real");
  await assert.rejects(httpHooks.onRequest(request("https://example.com/")),/secret|allowed/i);
  await assert.rejects(httpHooks.onRequest(new Request("https://example.com/",{headers:{Authorization:"Bearer github_pat_fake-real"}})),/secret|allowed/i);
  for (const ip of ["127.0.0.1","10.0.0.1","192.168.1.1","169.254.169.254","::1"]) assert.equal(await httpHooks.isIpAllowed({hostname:"example.com",ip,family:ip.includes(":") ? 6:4,port:443,protocol:"https"}),false);
  assert.equal(await httpHooks.isIpAllowed({hostname:"example.com",ip:"93.184.216.34",family:4,port:443,protocol:"https"}),true);
});

test("launch flags and renewal diagnostics stay explicit without credentials in output",() => {
  assert.deepEqual(agentCommand("amp",["-x","fixture"]),["/usr/local/bin/amp","--settings-file","/etc/agent-config/amp/settings.json","-x","fixture"]);
  assert.ok(agentCommand("claude").includes("--dangerously-skip-permissions"));
  assert.throws(() => agentCommand("claude",["login"]),/disabled/);
  for (const value of ["0","65536","-1","1;echo bad"]) assert.throws(() => parsePreview(value));
  assert.equal(parsePreview("3000"),3000);
  const messages = credentialStatus(Date.parse("2026-11-01"),name => name === "claude-expires" ? "2026-11-20":"private-fixture-token");
  assert.ok(messages.some(s => s.level === "warn" && s.message.includes("19 days")));
  assert.ok(!JSON.stringify(messages).includes("private-fixture-token"));
});

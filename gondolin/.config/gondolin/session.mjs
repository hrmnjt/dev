import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { CONFIG_DIR, HOME, readJson, projectInfo, inside, quote, globalGitConfig, guestEnv, providerGuard } from "./policy.mjs";
import { requireImage } from "./image.mjs";
import { secretDefinitions } from "./credentials.mjs";
import { startClipboard } from "./clipboard.mjs";
import { loadGondolin } from "./sdk.mjs";

// Chromium ignores the system CA bundle and reads trust from the user's NSS
// database ($1), here fed Gondolin's CA on stdin. The guest home is shared host
// state: create the database once (a parallel first boot may win the race), then
// replace the entry by name, since NSS refuses a changed CA under an existing
// name. `-f /dev/null` answers NSS password prompts: without it, -N on an
// existing database loops forever with no terminal. Only -A reads stdin.
const NSS_TRUST = `set -euo pipefail
umask 077
db=$1
mkdir -p "$db"
[ -e "$db/cert9.db" ] || certutil -N --empty-password -f /dev/null -d "sql:$db" </dev/null || [ -e "$db/cert9.db" ]
certutil -D -n gondolin-mitm-ca -f /dev/null -d "sql:$db" </dev/null 2>/dev/null || true
certutil -A -n gondolin-mitm-ca -t C,, -f /dev/null -d "sql:$db"`;

export async function createSession(options, dependencies = {}) {
  const {agent, cwd = process.cwd(), preview, resources = {}, outputDirectory, setupToken = false, signal, installationDirectory} = options;
  signal?.throwIfAborted();
  if (!["pi","claude"].includes(agent)) throw new Error("Unknown agent.");
  // Verify the image before retrieving secrets or creating any mutable state.
  const {spec,directory} = (dependencies.requireImage ?? requireImage)();
  const sdk = dependencies.sdk ?? await loadGondolin(installationDirectory);
  const {VM, RealFSProvider, ReadonlyProvider, MemoryProvider, SandboxVfsProvider, createHttpHooks, makePlaceholderFunc} = sdk;
  const project = setupToken ? null : projectInfo(cwd);
  const definitions = setupToken ? {} : secretDefinitions(agent, dependencies.keychainValue);
  const secrets = Object.fromEntries(Object.entries(definitions).map(([name,{value,hosts,prefix}]) => [name,{value,hosts,placeholder:makePlaceholderFunc({prefix,length:48})}]));
  const {httpHooks,env:secretEnv} = createHttpHooks({secrets,blockInternalRanges:true});
  const env = guestEnv(secretEnv);
  const mounts = {};
  let clipboard, vm;
  const config = readJson(path.join(CONFIG_DIR,"config.json"));
  const stateRoot = dependencies.stateRoot ?? path.join(os.homedir(),".local/state/agent-vm");
  const roPaths = [CONFIG_DIR];
  const hidden = project ? [path.join(project.workspace,"_models")] : [];
  // Legacy folded Stow layouts can put host auth in the source checkout. Do
  // not expose those files even when the user selects that checkout as workspace.
  if (project) for (const name of [".pi/agent/auth.json",".claude/.credentials.json",".claude.json"]) {
    try {hidden.push(fs.realpathSync(path.join(os.homedir(),name)));} catch { /* Absent host state. */ }
  }
  const real = root => new SandboxVfsProvider(new RealFSProvider(root),{before:providerGuard(root,{readOnly:roPaths,hidden,gitCommon:project.common})});
  const memory = new MemoryProvider();
  const put = async (file,content) => {
    await memory.mkdir(path.posix.dirname(file),{recursive:true});
    const handle = await memory.open(file,"w");
    try { await handle.writeFile(content); } finally { await handle.close(); }
  };
  let state;
  try {
    if (project) {
      mounts[project.workspace] = real(project.workspace);
      if (project.common && !inside(project.workspace,project.common)) mounts[project.common] = real(project.common);
      // Keep only this agent/project's mutable home, never the user's real home.
      state = path.join(stateRoot,project.key,agent,"home");
      fs.mkdirSync(state,{recursive:true,mode:0o700});
      if (fs.lstatSync(state).isSymbolicLink()) throw new Error("Agent state root must not be a symlink; repair it on the Mac.");
      for (const directory of [".pi",".claude"]) fs.mkdirSync(path.join(state,directory),{recursive:true,mode:0o700});
      if (agent === "claude") {
        // A project's shared state starts past first-run onboarding. The guest can
        // replace this directory, so never follow a symlink or overwrite Claude's file.
        const claudeState = path.join(state,"claude-state");
        fs.mkdirSync(claudeState,{recursive:true,mode:0o700});
        if (fs.lstatSync(claudeState).isSymbolicLink()) throw new Error("Agent state root must not be a symlink; repair it on the Mac.");
        try { fs.writeFileSync(path.join(claudeState,".claude.json"),JSON.stringify({hasCompletedOnboarding:true})+"\n",{flag:"wx",mode:0o600}); }
        catch (error) { if (error.code !== "EEXIST") throw error; }
      }
      mounts[HOME] = real(state);
      mounts[HOME+"/.pi"] = new ReadonlyProvider(new MemoryProvider());
      mounts[HOME+"/.claude"] = new ReadonlyProvider(new MemoryProvider());
      await put("/gitconfig",globalGitConfig(project.identity));
      const checkout = path.resolve(CONFIG_DIR,"../../..");
      // Host Git's global excludes keep editor and agent scratch files out of guest commits.
      const ignore = [path.join(checkout,"git/.config/git/ignore"),path.join(os.homedir(),".config/git/ignore")].find(file => fs.existsSync(file));
      await put("/gitignore",ignore ? fs.readFileSync(ignore) : "");
      const source = fs.existsSync(path.join(checkout,"claude/.config/agent-vm/claude/settings.json")) ? path.join(checkout,"claude/.config/agent-vm/claude") : path.join(os.homedir(),".config/agent-vm/claude");
      roPaths.push(fs.realpathSync(source),path.join(checkout,"gondolin/.local/bin"));
      await put("/claude/settings.json",fs.readFileSync(path.join(source,"settings.json")));
      await put("/claude/CLAUDE.md",fs.readFileSync(path.join(source,"CLAUDE.md")));
      for (const theme of fs.readdirSync(path.join(source,"themes")).filter(f => f.endsWith(".json"))) await put("/claude/themes/"+theme,fs.readFileSync(path.join(source,"themes",theme)));
      mounts["/etc/agent-config"] = new ReadonlyProvider(memory);
      if (outputDirectory) mounts["/pi-output"] = new ReadonlyProvider(new RealFSProvider(outputDirectory));
      for (const [guest,host] of Object.entries(resources)) mounts[guest] = new ReadonlyProvider(new RealFSProvider(host));
      if (agent !== "pi") {
        clipboard = await (dependencies.startClipboard ?? startClipboard)();
        env.AGENT_CLIPBOARD_URL = `http://clipboard.agent.internal:18765${clipboard.route}`;
      }
    }
    vm = await VM.create({
      // Gondolin grows the sparse per-session overlay, then runs resize2fs at boot.
      sandbox:{vmm:"qemu",imagePath:directory,debug:false}, debugLog:null, rootfs:{mode:"cow",size:config.disk},
      memory:config.memory,cpus:config.cpus,startTimeoutMs:60000,
      sessionLabel:`${agent} ${project ? path.basename(project.workspace) : "setup-token (no mounts)"}`,
      env,httpHooks,dns:{mode:"synthetic",syntheticHostMapping:"per-host"},
      // Gondolin's default set also hides /var/cache and /var/log behind tmpfs,
      // leaving apt/debconf without their directories. The cow root is discarded.
      tmpfs:{"/tmp":{},"/var/tmp":{},"/root":{mode:"0700"}},
      ...(clipboard ? {tcp:{hosts:{"clipboard.agent.internal:18765":`127.0.0.1:${clipboard.port}`}}} : {}),
      // setup-token mounts no host path, but keeps an (empty) VFS: Gondolin injects
      // its read-only TLS interception CA through it, and HTTPS fails without it.
      vfs:{mounts:project ? mounts : {},fuseMount:"/mnt/agent-host"},
    });
    signal?.throwIfAborted();
    const checked = async (stage,command,opts) => {
      signal?.throwIfAborted();
      const result = await vm.exec(command,{signal,...opts});
      if (result.exitCode !== 0) {
        // Only setup-command output, never SDK exceptions/requests or env dumps.
        // Redact before truncation so a boundary cannot expose a partial token.
        const sensitive = [...Object.values(definitions).map(d => d.value),...Object.values(secretEnv)]
          .filter(value => typeof value === "string" && value.length).sort((a,b) => b.length-a.length);
        const diagnostic = (value,limit = 4096) => {
          let text = String(value ?? "");
          for (const secret of sensitive) text = text.replaceAll(secret,"[redacted]");
          return JSON.stringify(text.length > limit ? "[truncated] "+text.slice(-limit) : text);
        };
        const output = ["stderr","stdout"].filter(stream => result[stream]).map(stream => `${stream}: ${diagnostic(result[stream])}`);
        throw new Error(`Guest initialization failed during ${diagnostic(stage,256)} (exit ${result.exitCode}; no host fallback).${output.length ? "\n"+output.join("\n") : ""}`);
      }
      return result;
    };
    const marker = JSON.parse(await vm.fs.readFile("/etc/agent-image.json",{encoding:"utf8"}));
    if (marker.fingerprint !== spec.fingerprint) throw new Error("Guest image is stale; run agent-vm build on the Mac.");
    // Gondolin backdates its TLS interception certificates by only five minutes
    // and re-syncs the guest clock only when an idle VM resumes. Mac sleep leaves
    // a busy guest behind, failing HTTPS to newly seen hosts and apt's date checks.
    const setClock = () => ["/bin/date","-u","-s","@"+(Date.now()/1000).toFixed(3)];
    await checked("guest clock sync",setClock());
    if (project) {
      // Gondolin 0.14 sandboxfs is mounted root-only. bindfs re-exports the same
      // guarded providers to UID 1000; it grants no new host paths or permissions.
      // Gondolin has already bind-mounted each target, and Debian's bindfs uses
      // libfuse 2, which refuses a non-empty mountpoint without `nonempty`.
      for (const target of Object.keys(mounts).sort((a,b) => a.length-b.length)) {
        await checked(`bindfs ${target}`,["/usr/bin/bindfs","--force-user=1000","--force-group=1000","-o","allow_other,nonempty","/mnt/agent-host"+target,target]);
      }
      // Restore the image's recorded setuid/setgid/sticky and writable modes (see
      // Dockerfile). A path that no longer exists, e.g. under tmpfs, is ignored.
      await checked("guest mode restore",["/bin/bash","-c","while IFS=$'\\t' read -r mode file; do chmod \"$mode\" \"$file\" 2>/dev/null || true; done < /etc/agent-image-modes"]);
      // Gondolin leaves the hostname "(none)", which sudo warns it cannot resolve.
      // localhost must also resolve from /etc/hosts, never from synthetic DNS.
      const hostname = `${agent}-vm`;
      await checked("guest hostname setup",["/bin/bash","-c",`hostname ${hostname} && { grep -qw localhost /etc/hosts 2>/dev/null || printf '127.0.0.1\\tlocalhost\\n::1\\tlocalhost ip6-localhost ip6-loopback\\n' >> /etc/hosts; } && printf '127.0.1.1\\t%s\\n' ${hostname} >> /etc/hosts`]);
      await checked("guest state/config setup",["/bin/bash","-c",`mkdir -p ${HOME}/claude-state ${HOME}/.cache ${HOME}/.local/share /etc/claude-code; ln -sfn /etc/agent-config/claude/CLAUDE.md ${HOME}/claude-state/CLAUDE.md; ln -sfn /etc/agent-config/claude/themes ${HOME}/claude-state/themes; ln -sfn /etc/agent-config/claude/settings.json /etc/claude-code/managed-settings.json`]);
      // These probes must actually fail, not merely be configured read-only.
      await checked("non-root access/write-denial probes",["/usr/local/bin/agent-enter","/bin/bash","-c",`test "$(id -u)" = 1000 && test -r "$1" && test -w "$1" && test -w "$HOME" && ! touch /etc/agent-config/.write-probe && ! touch "$HOME/.pi/.write-probe" && ! touch "$HOME/.claude/.write-probe"`,"probe",project.workspace]);
      // Root opens the CA (/etc/gondolin is root-only); certutil runs as the agent,
      // so UID 1000 owns the database. A failure stops launch like every stage:
      // the guide promises this trust, and a silently untrusted session would
      // push agents back to disabling certificate checks in project code.
      await checked("Chromium CA trust",["/bin/bash","-c",'exec /usr/local/bin/agent-enter /bin/bash -c "$1" nss-trust "$2" < "$3"',"chromium-ca",NSS_TRUST,`${HOME}/.pki/nssdb`,"/etc/gondolin/mitm/ca.crt"]);
    }
    let ingress;
    if (preview) {
      vm.setIngressRoutes([{prefix:"/",port:preview,stripPrefix:true}]);
      ingress = await vm.enableIngress({listenHost:"127.0.0.1",listenPort:0});
    }
    // Claude keeps its VM busy for the whole session. Pi's VM idles
    // between tool calls, and Gondolin re-syncs it when it resumes.
    const clockTimer = agent === "pi" ? null : setInterval(() => { Promise.resolve().then(() => vm.exec(setClock())).catch(() => {}); },30_000);
    clockTimer?.unref();
    let closed = false;
    return {
      vm, project, env, state, ingress,
      async close() {
        if (closed) return; closed = true;
        clearInterval(clockTimer);
        try { await vm.close(); } finally { await clipboard?.close(); }
      },
      // The SDK merges VM defaults (including its CA bundle variables) with this
      // allowlisted environment. Never pass options.env supplied by Pi's host Bash tool.
      exec(command,opts = {}) { return vm.exec(["/usr/local/bin/agent-enter",...command],{...opts,env,cwd:opts.cwd ?? project?.cwd ?? HOME}); },
      // Pi's write/edit tools create files as the same non-root user as its bash
      // tool. The SDK's vm.fs runs as root and would leave root-owned guest files.
      async writeFile(file,content,{signal} = {}) {
        const result = await vm.exec(["/usr/local/bin/agent-enter","/bin/sh","-c",'cat > "$1"',"sh",file],{env,signal,cwd:project?.cwd ?? HOME,stdin:Buffer.from(content)});
        if (result.exitCode !== 0) throw new Error(`Guest write failed: ${String(result.stderr ?? "").trim() || "exit "+result.exitCode}`);
      },
      async mkdir(directory,{signal} = {}) {
        const result = await vm.exec(["/usr/local/bin/agent-enter","/bin/mkdir","-p","--",directory],{env,signal,cwd:project?.cwd ?? HOME});
        if (result.exitCode !== 0) throw new Error(`Guest mkdir failed: ${String(result.stderr ?? "").trim() || "exit "+result.exitCode}`);
      },
      async bash(command,directory,{onData,signal,timeout} = {}) {
        signal?.throwIfAborted();
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener("abort",abort,{once:true});
        const timer = timeout > 0 ? setTimeout(abort,timeout*1000) : null;
        try {
          const proc = vm.exec(["/usr/local/bin/agent-enter","/bin/bash","--noprofile","--norc","-c",command],{cwd:directory,env,signal:controller.signal,stdout:"pipe",stderr:"pipe"});
          for await (const chunk of proc.output()) onData?.(chunk.data);
          const result = await proc;
          if (controller.signal.aborted) throw new Error(signal?.aborted ? "aborted" : `timeout:${timeout}`);
          return {exitCode:result.exitCode};
        } catch (error) {
          if (controller.signal.aborted) throw new Error(signal?.aborted ? "aborted" : `timeout:${timeout}`);
          throw error;
        } finally { if (timer) clearTimeout(timer);signal?.removeEventListener("abort",abort); }
      },
    };
  } catch (error) {
    await Promise.allSettled([vm?.close(),clipboard?.close()]);
    if (signal?.aborted) throw new Error("Agent startup cancelled; no host fallback.");
    // Do not include SDK requests, environments or token-bearing exception data.
    if (error instanceof Error && /^(Guest |Pinned |Agent |Start |Gondolin |Git |Keychain )/.test(error.message)) throw error;
    throw new Error("Gondolin launch failed. Check QEMU, npm ci --prefix ~/.config/gondolin, and agent-vm build on the Mac; nothing ran on the host.");
  }
}

// Host policy shared by Pi, Claude Code and Amp. No agent process runs here.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));
export const HOME = "/home/agent";
export const inside = (root, file) => file === root || file.startsWith(root.endsWith("/") ? root : root + "/");
export const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
export const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
export const pins = readJson(path.join(CONFIG_DIR, "pins.json"));
const gitEnv = () => ({ PATH: process.env.PATH, HOME: os.homedir(), LANG: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" });
function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, "-c", "core.fsmonitor=false", ...args], {env: gitEnv(), encoding:"utf8", stdio:["ignore","pipe","pipe"]}).trim();
}
export function projectInfo(cwd, home = os.homedir()) {
  cwd = fs.realpathSync(cwd);
  home = fs.realpathSync(home);
  const privateRoots = [".config",".pi",".claude",".ssh",".aws",".azure",".gnupg",".kube",".docker","Library",".local"]
    .map(name => {const file = path.join(home,name);try {return fs.realpathSync(file);} catch {return file;}});
  if (inside(cwd,home) || privateRoots.some(root => inside(root,cwd))) throw new Error("Refusing a home/root/config workspace; start from a dedicated project directory on the Mac.");
  let workspace = cwd, common = null;
  try {
    workspace = fs.realpathSync(git(cwd, ["rev-parse", "--show-toplevel"]));
    common = fs.realpathSync(git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  } catch (error) {
    // Only an ordinary non-repository directory is allowed to lack Git metadata.
    if (!String(error.stderr).includes("not a git repository")) throw new Error("Cannot inspect Git metadata; repair this checkout with host Git.");
  }
  if (inside(workspace,home) || privateRoots.some(root => inside(root,workspace)) || (common && inside(common,home))) throw new Error("Refusing mounts that expose the host home; repair/select a dedicated project on the Mac.");
  const primary = common ?? workspace;
  const rules = [[path.join(home,"code/work"),"config.work"], [path.join(home,"code/github.com/hrmnjt"),"config.personal"]];
  const selected = rules.find(([root]) => inside(root, primary));
  let identity = null;
  if (selected) {
    const file = path.join(home, ".config/git", selected[1]);
    try {
      const field = key => execFileSync("git", ["config", "--file", file, "--get", key], {env:gitEnv(),encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
      identity = {name:field("user.name"), email:field("user.email")};
      if (!identity.name || !identity.email || /[\r\n\0]/.test(identity.name + identity.email)) throw new Error();
    } catch { throw new Error(`Git identity missing or invalid; repair ${file} on the Mac (no fallback identity).`); }
  }
  return {cwd, workspace, common, primary, identity, key:createHash("sha256").update(primary).digest("hex").slice(0,24)};
}

// Mirrors the tracked host Git settings (git/.config/git/config) except includes,
// helpers and identity files; the session serves the excludes file read-only.
export function globalGitConfig(identity) {
  const escaped = text => JSON.stringify(text);
  return `[user]\n\tuseConfigOnly = true\n${identity ? `\tname = ${escaped(identity.name)}\n\temail = ${escaped(identity.email)}\n` : ""}
[core]
\texcludesFile = /etc/agent-config/gitignore
[init]
\tdefaultBranch = main
[pull]
\tff = only
[fetch]
\tprune = true
[branch]
\tsort = -committerdate
[rerere]
\tenabled = true
[merge]
\tconflictStyle = zdiff3
[safe]
\tdirectory = *
[url "https://github.com/"]
\tinsteadOf = git@github.com:
\tinsteadOf = ssh://git@github.com/
[credential "https://github.com"]
\thelper =
\thelper = "!f() { echo username=x-access-token; echo \\"password=$GH_TOKEN\\"; }; f"
`;
}

// No host environment spread: no SSH agent, auth, Git identity overrides, proxy,
// startup injection, or CLI integration sockets cross into the guest.
export function guestEnv(secretEnv = {}, terminal = process.env) {
  const env = {
    HOME, USER:"agent", LOGNAME:"agent", PATH:"/usr/local/bin:/usr/bin:/bin",
    LANG:"C.UTF-8", TERM:"xterm-256color", COLORTERM:"truecolor",
    XDG_CONFIG_HOME:HOME+"/.config", XDG_DATA_HOME:HOME+"/.local/share", XDG_CACHE_HOME:HOME+"/.cache",
    GIT_CONFIG_GLOBAL:"/etc/agent-config/gitconfig", GIT_CONFIG_NOSYSTEM:"1", GIT_TERMINAL_PROMPT:"0",
    GIT_CONFIG_COUNT:"1", GIT_CONFIG_KEY_0:"user.useConfigOnly", GIT_CONFIG_VALUE_0:"true",
    CLAUDE_CONFIG_DIR:HOME+"/claude-state", DISABLE_AUTOUPDATER:"1",
    AMP_SKIP_UPDATE_CHECK:"1", AMP_FORCE_BEL:"1", AMP_DISABLE_AMP_THREAD_TRAILER:"1",
    PLAYWRIGHT_BROWSERS_PATH:"/opt/playwright", DISPLAY:":0",
    // Gondolin's init points Node at its CA on the root-only VFS mount. The
    // runtime bundle (system CAs plus that CA) is world-readable, as curl uses.
    NODE_EXTRA_CA_CERTS:"/run/gondolin/ca-certificates.crt",
    ...secretEnv,
  };
  // Terminal detection only: never forward Rex's RPC socket or hook commands.
  for (const key of ["TERM_PROGRAM", "TERM_PROGRAM_VERSION", "PI_PROGRAM_STATUS"]) {
    if (typeof terminal[key] === "string") env[key] = terminal[key];
  }
  return env;
}

const denied = message => Object.assign(new Error(message), {code:"EROFS", errno:-30});
const mutating = new Set(["mkdir", "rmdir", "unlink", "rename", "link", "symlink", "chmod", "truncate", "write", "writeFile"]);
const destructive = new Set(["rename", "rmdir", "unlink"]);
const protectedName = p => p.split("/").some(part => part === ".pi" || part === ".claude");
// Hook paths are provider-relative, checked before every operation including
// open/truncate/rename/link. RealFSProvider separately rejects symlink escapes.
export function providerGuard(root, {readOnly = [], hidden = [], gitCommon = null} = {}) {
  root = fs.realpathSync(root);
  const isProtected = absolute => protectedName(absolute) || readOnly.some(p => inside(p, absolute)) ||
    (gitCommon && inside(path.join(gitCommon,"hooks"),absolute)) || /(^|\/)\.git\/hooks(\/|$)/.test(absolute);
  const resolved = file => {
    let current = file, suffix = [];
    while (true) {
      try { return path.join(fs.realpathSync(current), ...suffix); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        const parent = path.dirname(current);
        if (parent === current) throw error;
        suffix.unshift(path.basename(current)); current = parent;
      }
    }
  };
  const hasProtectedDescendant = file => {
    if (readOnly.some(p => inside(file,p)) || (gitCommon && inside(file,path.join(gitCommon,"hooks")))) return true;
    let stat;
    try { stat = fs.lstatSync(file); } catch (error) { if (error.code === "ENOENT") return false; throw error; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    for (const entry of fs.readdirSync(file)) {
      const child = path.join(file,entry);
      if (isProtected(child) || hasProtectedDescendant(child)) return true;
    }
    return false;
  };
  return ({op, path: file, oldPath, newPath, flags}) => {
    const writing = mutating.has(op) || (op === "open" && (typeof flags === "number" ? (flags & 3) !== 0 || (flags & 0x600) !== 0 : /[wa+]/.test(flags ?? "")));
    for (const input of [file, oldPath, newPath].filter(Boolean)) {
      const absolute = path.resolve(root,"." + (input.startsWith("/") ? input : "/"+input));
      const real = resolved(absolute);
      if (!inside(root, absolute) || !inside(root, real)) throw denied("Mount escape denied");
      if (hidden.some(p => inside(p,absolute) || inside(p,real))) throw denied("Path is not exposed to the VM");
      if (!writing) continue;
      if (isProtected(absolute) || isProtected(real)) throw denied("Agent configuration and Git hooks are read-only");
      // Never replace the linked-worktree pointer itself.
      if (path.basename(absolute) === ".git" && fs.existsSync(absolute) && !fs.lstatSync(absolute).isDirectory()) throw denied("Git worktree pointer is read-only");
      if (destructive.has(op) && (hasProtectedDescendant(absolute) || hidden.some(p => inside(absolute,p)))) throw denied("Cannot move/remove a protected ancestor");
      if (!["unlink", "rename", "mkdir", "symlink"].includes(op)) {
        try { const stat = fs.statSync(real);if (stat.isFile() && stat.nlink > 1) throw denied("Hard-linked files cannot be mutated through a host mount"); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
      }
    }
  };
}

export function parsePreview(value) {
  if (!/^[1-9][0-9]{0,4}$/.test(value) || Number(value)>65535) throw new Error("--preview needs a guest port between 1 and 65535.");
  return Number(value);
}
export function agentCommand(agent, args = []) {
  if (!["claude","amp"].includes(agent)) throw new Error("Expected claude or amp.");
  if (args.some(a => /^(login|logout|auth|setup-token|update|upgrade|install|uninstall)$/.test(a))) throw new Error("Login/update/install commands are disabled; use the documented host setup-token flow or rebuild the pinned image.");
  return agent === "claude" ? ["/usr/local/bin/claude", "--dangerously-skip-permissions", "--settings", "/etc/agent-config/claude/settings.json", ...args] :
    ["/usr/local/bin/amp", "--settings-file", "/etc/agent-config/amp/settings.json", ...args];
}

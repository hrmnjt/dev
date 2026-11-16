// Only this host module retrieves real tokens. Callers never print its output.
import os from "node:os";
import { execFileSync } from "node:child_process";

export const service = name => `dev.agent-vm.${name}`;
export function keychainValue(name) {
  if (process.platform !== "darwin") throw new Error("Agent VM credentials require the Mac Keychain; launch from the Mac.");
  try {
    const value = execFileSync("/usr/bin/security",["find-generic-password","-a",os.userInfo().username,"-s",service(name),"-w"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();
    if (!value || /[\r\n\0]/.test(value)) throw new Error();
    return value;
  } catch { throw new Error(`Keychain entry ${service(name)} missing or inaccessible. Add it in Keychain Access as documented in gondolin/README.md.`); }
}
export function secretDefinitions(agent, lookup = keychainValue) {
  const definitions = {};
  const add = (name, variable, prefix, hosts) => {
    const value = lookup(name);
    if (!value.startsWith(prefix)) throw new Error(`Keychain entry ${service(name)} has the wrong token type; replace it on the Mac.`);
    definitions[variable] = {value, hosts, prefix};
  };
  add("github","GH_TOKEN","github_pat_",["github.com","api.github.com"]);
  if (agent === "claude") add("claude","CLAUDE_CODE_OAUTH_TOKEN","sk-ant-oat01-",["api.anthropic.com"]);
  return definitions;
}
export function credentialStatus(now = Date.now(), lookup = keychainValue) {
  const messages = [];
  for (const name of ["github","claude"]) {
    try { lookup(name); messages.push({level:"pass",message:`Keychain ${service(name)} exists`}); }
    catch { messages.push({level:"warn",message:`Add Keychain ${service(name)} (see gondolin/README.md)`}); }
  }
  try {
    const expiry = lookup("claude-expires");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || (!Number.isFinite(Date.parse(expiry)) || new Date(expiry).toISOString().slice(0,10) !== expiry)) throw new Error();
    const days = Math.floor((Date.parse(expiry)-now)/86400000);
    messages.push({level:days <= 30 ? "warn":"pass",message:days <= 0 ? "Claude token expired: run claude setup-token in a throwaway VM and replace the Keychain token/expiry" : `Claude token expires in ${days} days`});
  } catch { messages.push({level:"warn",message:`Add Keychain ${service("claude-expires")} with token expiry YYYY-MM-DD so doctor can warn before renewal`}); }
  return messages;
}

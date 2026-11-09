# Amp in Gondolin

Amp is pinned as `@ampcode/cli` in the shared Debian guest image; it is not
installed on the Mac. The old `@sourcegraph/amp` package now redirects to that
package. `amp` on the Mac is only a VM launcher.

Follow [shared setup, credentials and branch trials](../gondolin/README.md).
This candidate still needs a real image build and host acceptance.

## Configuration and daily use

Stow deploys `.config/agent-vm/amp/settings.json`, deliberately outside Amp's
normal Mac config path. The launcher copies only that file into a read-only
guest provider and passes `--settings-file /etc/agent-config/amp/settings.json`.
The VM-only file sets `amp.dangerouslyAllowAll: true`; a legacy Mac install does
not inherit bypass mode from its default settings path.

The pinned binary advertises this setting—not a `--dangerously-allow-all` option—in
its help. The image build checks the setting/custom-settings interface and exact
package versions. Failures report the command/status/output or missing interface
instead of silently failing a grep. Real prompt-free execution still needs testing.

- Auto-update is disabled in settings and by `AMP_SKIP_UPDATE_CHECK=1`.
- `AMP_API_KEY` is a fresh `sgamp_`-shaped placeholder, substituted only for
  `ampcode.com` and its subdomains (the docs name no API host). Get the real
  token from Amp's Settings (access token, `/settings/security`) and store it
  in the Mac Keychain; no guest `amp login`. Amp honours `NODE_EXTRA_CA_CERTS`
  for Gondolin's TLS interception.
- Images: `Ctrl+V` reads the Mac clipboard through the images-only proxy.
  Dragging a file in types its path, which works only inside the worktree.
- Completion/blocked notifications use `AMP_FORCE_BEL=1`; an OSC 7501 plugin
  remains deferred. Git coauthor/thread trailers are disabled.
- Mutable home/XDG data persist per primary project, shared by its worktrees
  and kept separate from Claude/Pi and other projects.
- Workspace edits and ordinary Git/gh commit, push and PR operations use the
  shared mount/identity/GitHub policy, not host CLI authentication.

```bash
amp
amp --preview 5173
```

Rex **Cmd+Alt+A** opens an Amp pane in the current worktree tab without previews.
`Ctrl+V` is served by the images-only host proxy, never text clipboard access.
Playwright/Chromium and opt-in loopback ingress are shared with Claude.

Remaining real checks: placeholder acceptance, prompt-free execution, both bell
states, image paste, preview/browser tests, commit/push/PR, project-separated
history/memory, and clean shutdown. Fixture tests do not prove these. Amp cloud
executors remain complementary; this launcher does not implement or proxy them.

References: [CLI](https://ampcode.com/docs/cli),
[settings](https://ampcode.com/docs/cli/settings),
[plugin API](https://ampcode.com/docs/plugin-api).

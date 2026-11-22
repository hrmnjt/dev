# TODO

## Gondolin acceptance

The migration is still a **candidate**, not fully host-accepted. Do not merge or
deploy until the remaining checks are complete. Setup, boundaries and test
commands live in the [shared VM guide](gondolin/README.md); agent-specific use
lives in [Pi](pi/README.md) and [Claude Code](claude/README.md). Historical plans,
build failures and test transcripts are available in Git history.

### Already observed

These are earlier observations, not proof that the current image has passed:

- **2026-11-09 and 2026-11-16:** the opt-in live VM fixture passed with synthetic
  tokens, covering non-root/sudo access, protected-path denials, same-path
  worktree/Git mounts, identity, overflow and timeout recovery.
- **2026-11-09:** Keychain credential checks passed. Real Claude launches
  confirmed folder trust without onboarding/bypass prompts, Rex status,
  `Ctrl+V` image paste, `sudo apt-get` and `--resume`.
- **2026-11-16:** a rebuilt Amp-free image could push from the VM. A branch Pi
  trial confirmed VM filesystem tools and codemode, host `!hostname`, personal
  Git identity, protected-path denials including through sudo, overflow reads,
  `/reload` and clean `/exit`.
- **2026-11-22:** source changed to installer-managed Pi discovery and added
  pinned uv plus `.venv-vm` isolation. Rebuild and recheck the current source;
  earlier launcher/image results do not establish acceptance of these changes.

### Remaining checks

Run these deliberately from a host terminal using the
[acceptance guide](gondolin/README.md#checks-and-remaining-acceptance):

- [ ] Build the current fingerprinted image; rerun the live VM fixture, VM/Pi
  suites and full `just doctor --verbose`.
- [ ] Verify installer-managed Pi discovery and `pi update`; confirm `VM <id>`
  before typing, and failure shutdown once the extension has loaded.
- [ ] Measure boot time/RSS and parallel-agent memory use. The current
  4 GiB/2 CPU budget is provisional.
- [ ] Walk through a working day with Pi and Claude and confirm it with the user.
- [ ] Check Pi tool images, `/answer` navigation/answer retention and local-model
  extraction, `/review` interfaces, review-summary reload/tree behavior and
  tldraw create/save/screenshot/cleanup on a disposable canvas.
- [ ] Check resume/new sessions and history/memory across worktrees and parallel
  sessions; verify pre-migration session recovery where needed.
- [ ] Check preview ingress and Playwright, including external HTTPS handling.
- [ ] Create a PR and verify main-branch rulesets refuse prohibited pushes;
  confirm private-repository enforcement on the current GitHub plan.
- [ ] After acceptance, merge and deploy from the primary checkout using the
  [Pi migration steps](pi/README.md#deploy), then verify the deployed setup.

Retire this acceptance tracker when complete, not the reusable checks in the
package guides. The Mac Claude CLI, desktop app and Codex remain installed;
retiring them is a separate decision.

## Later

- [ ] Add per-project Mac service mappings only when a project needs one.
- [ ] Revisit unattended agents in the main `dev` checkout: its Stow targets are
  live, and writable `.git/config` retains a host-execution risk.
- [ ] Consider VMs per worktree only if per-session boot or reinstalls become
  costly.
- [ ] Trust Gondolin's CA in Chromium's NSS store (`libnss3-tools`) if external
  HTTPS browsing needs to work without `ignoreHTTPSErrors`.
- [ ] Compare provider/local-model quality with bounded, privacy-safe trials;
  keep private session material local unless a cloud handoff is approved.

## Amp: deferred

Removed on **2026-11-16** to keep the image and launcher small. Commit `95ef4ef`
is the last version with Amp support.

- Worked: `sgamp_` Keychain substitution for `ampcode.com` and `*.ampcode.com`,
  read-only `--settings-file` with `amp.dangerouslyAllowAll`, `AMP_FORCE_BEL`
  and prompt-free guest package installation. There is no CLI bypass flag.
- Blocked: image upload failed with Bun's `EPROTO` TLS handshake error, both to
  Google Cloud Storage and the Amp upload proxy. HTTP/2-only behavior is an
  unconfirmed suspect; the VPN was on during the trial.
- Maintenance cost: Amp refused an eight-day-old CLI, requiring frequent image
  rebuilds.

Before retrying, compare `openssl s_client -alpn h2` and `http/1.1` against the
upload host inside the VM. Consult the [Amp CLI docs](https://ampcode.com/docs/cli)
and [settings](https://ampcode.com/docs/cli/settings), then repeat acceptance
rather than assuming the old trial still applies.

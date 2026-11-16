# Podman

General-purpose Podman configuration for local containers and image builds.
The root Brewfile installs the CLI; its Mac Linux machine is initialized and
started separately. Tracking or Stowing this config does not create/start it.

## Tracked configuration

Stow deploys `.config/containers/containers.conf` to
`~/.config/containers/containers.conf`.

The only override is `[machine].volumes = []`: do not automatically share Mac
directories with the Linux machine. Build contexts are still sent to the engine.
Host-path bind mounts require explicit machine shares; configure those as needed
for the workflows that use them.

Provider, CPU, memory, disk, rootless mode and registry/TLS behavior retain
Podman's defaults. Measure the machine against its workloads before choosing
resource overrides. Machine defaults apply at creation; editing this file does
not reconfigure an existing machine.

## Try the branch without deploying

Run in a normal Mac terminal from the implementation worktree:

```bash
export CONTAINERS_CONF="$PWD/podman/.config/containers/containers.conf"
podman machine list
```

This reads the tracked file directly while generated state stays in the usual
host directories. Keep this variable set in that terminal for subsequent Podman
commands. `CONTAINERS_CONF` replaces other containers.conf
files; `CONTAINERS_CONF_OVERRIDE`, if set, is still loaded last. Do not redirect
`HOME`, `XDG_CONFIG_HOME` or `XDG_DATA_HOME` into the checkout.

After checking that no machine already exists, initialize/start it deliberately:

```bash
podman machine init
podman machine start
podman info
```

Initialization downloads an OS image and creates local state/SSH keys; startup
launches the Linux machine. These are deliberate host steps. No auto-start service
is installed by this package. Verify the machine's mounts before relying on
host-path access. Stop it when no longer needed with `podman machine stop`.

For permanent deployment, Stow from the primary checkout only after merge:
`stow --no-folding -t "$HOME" podman`. Inspect existing config before replacing
anything. Once deployed, unset the temporary `CONTAINERS_CONF` override.

## Runtime state is not dotfiles

Only the intentional containers.conf is tracked. Machine definitions, generated
connections/SSH keys, registry credentials, downloaded images, disks, sockets
and caches remain local. Typical locations include
`~/.config/containers/podman/`, `~/.config/containers/podman-connections.json`
and `~/.local/share/containers/`. Git/Stow ignores guard against accidentally
adding known generated files to this package.

Even inspection commands such as `podman machine list` may create config/state
directories. Do not assume they are read-only or move mutable state into the
checkout to make them work.

One consumer of this general configuration is
[Gondolin image builds](../gondolin/README.md#try-this-branch-without-deploying).

References: installed Podman 6.1.4 `podman-machine(1)`,
`podman-machine-init(1)`, and
[containers.conf](https://github.com/containers/container-libs/blob/main/common/docs/containers.conf.5.md).

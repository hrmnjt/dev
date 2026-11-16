# Podman

Podman runs Linux containers on the Mac inside its own Linux VM, the Podman
machine. The root Brewfile installs the CLI; creating and starting the machine
are deliberate host steps.

## Configuration

Stow deploys `.config/containers/containers.conf` to
`~/.config/containers/containers.conf`. Its only setting, `[machine].volumes = []`,
stops new machines from sharing Mac directories; otherwise Podman shares your
home directory. Image builds still work because Podman sends the build context
over its API. If a workflow needs host bind mounts, add that share to the machine
explicitly.

Machine defaults apply only when a machine is created, so editing this file does
not change an existing one. Deploy the file before creating the machine:

```bash
just stowall
podman machine init
podman machine start
podman info
```

## Runtime state

Machine definitions, connections, SSH keys, registry credentials, images and
disks live under `~/.config/containers/` and `~/.local/share/containers/`. They
are runtime state, not dotfiles, and stay untracked. `stow --no-folding` keeps
`~/.config/containers/` a real directory, so none of it lands in this checkout.

#!/usr/bin/env python3
"""Local Git worktree actions, invoked in a temporary Rex/fzf menu session."""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


class Failure(Exception):
    pass


class Cancelled(Exception):
    pass


def run(argv, *, cwd=None, env=None):
    try:
        result = subprocess.run(argv, cwd=cwd, env=env, capture_output=True,
                                text=True, timeout=120)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Failure(str(exc)) from exc
    if result.returncode:
        raise Failure(f"{argv[0]} failed: {result.stderr.strip() or result.stdout.strip()}")
    return result.stdout


def git(directory, *args):
    # Explicit -C must win over inherited shell Git routing/index variables.
    env = {k: v for k, v in os.environ.items()
           if k not in {"GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"}}
    return run(["git", "-C", str(directory), *args], env=env)


def worktrees(directory):
    records, record = [], {}
    for token in git(directory, "worktree", "list", "--porcelain", "-z").split("\0"):
        if not token:
            if record:
                records.append(record)
                record = {}
            continue
        key, _, value = token.partition(" ")
        record[key] = value
    if record:
        records.append(record)
    for item in records:
        item["path"] = Path(item["worktree"]).resolve()
        item["branch"] = item.get("branch", "").removeprefix("refs/heads/")
    return records


def inside(path, root):
    try:
        Path(path).resolve().relative_to(root)
        return True
    except ValueError:
        return False


def slug(value):
    name = re.sub(r"[^a-zA-Z0-9-]+", "-", value).strip("-")
    return name or "worktree-" + hashlib.sha256(value.encode()).hexdigest()[:8]


def visible(value):
    # Never let branch names or paths add terminal control sequences/menu rows.
    return "".join(c if c.isprintable() else "?" for c in str(value))


class Menu:
    def pick(self, title, choices):
        if not choices:
            raise Failure("No choices available")
        rows = [f"{i}\t{visible(label)}" for i, (label, _) in enumerate(choices)]
        env = dict(os.environ, FZF_DEFAULT_OPTS="", FZF_DEFAULT_OPTS_FILE="/dev/null")
        result = subprocess.run(
            ["fzf", "--read0", "--print0", "--delimiter=\t", "--with-nth=2..",
             "--no-sort", "--layout=reverse", "--header=" + visible(title), "--prompt=worktree> "],
            input=("\0".join(rows) + "\0").encode(), stdout=subprocess.PIPE, env=env)
        if result.returncode in (1, 130):
            raise Cancelled()
        if result.returncode:
            raise Failure("fzf failed")
        index = int(result.stdout.split(b"\t", 1)[0])
        return choices[index][1]

    def branch(self):
        value = input("New branch name (blank cancels): ").strip()
        if not value:
            raise Cancelled()
        return value


class Rex:
    def __init__(self, client):
        directory = os.environ.get("REX_BIN_DIR")
        candidate = Path(directory) / "rex" if directory else None
        self.binary = str(candidate) if candidate and candidate.is_file() else shutil.which("rex")
        if not self.binary:
            raise Failure("rex is not on PATH; launch this menu from Rex")
        self.client = client
        self.helper = os.environ.get("REX_SESSION")
        self.host = self.json("whoami", "--json")["host_id"]

    def text(self, *args):
        return run([self.binary, "--autostart=false", *args])

    def json(self, *args):
        return json.loads(self.text(*args))

    def sessions(self):
        return {s["session_id"]: s["label"] for s in self.json("ls", "--json")["sessions"]}

    def directories(self, session):
        view = self.json("api", "call", "session.view", json.dumps({"session_id": session}))
        directories = []
        for window in view.get("windows") or []:
            for layer in window.get("layers") or []:
                for block in layer.get("blocks") or []:
                    if block.get("host_id") != self.host:
                        directories.append(None)  # remote/unknown blocks cannot authorize deletion
                    elif block.get("creator_name") == "com.superlogical.terminal":
                        process = self.json("block", "call", "-s", session,
                                            "-b", block["block_id"], "process")
                        directories.append((process.get("foreground") or {}).get("cwd")
                                           or (process.get("child") or {}).get("cwd"))
        return directories

    def block_directory(self, session, block):
        process = self.json("block", "call", "-s", session, "-b", block, "process")
        return ((process.get("foreground") or {}).get("cwd")
                or (process.get("child") or {}).get("cwd"))

    def create(self, label, path):
        return self.json("new", label, "-c", str(path), "--json")["session_id"]

    def focus(self, session):
        self.text("-C", self.client, "do", "session.select", "session_id=" + session)

    def kill(self, session):
        self.text("kill", session)


class Workflow:
    def __init__(self, directory, source, block, rex, menu, state_home=None):
        self.rex, self.menu, self.source, self.block = rex, menu, source, block
        self.checkout = Path(git(directory, "rev-parse", "--show-toplevel").removesuffix("\n")).resolve()
        self.trees = worktrees(self.checkout)
        if not self.trees or "bare" in self.trees[0]:
            raise Failure("A non-bare primary checkout is required")
        self.primary = self.trees[0]["path"]
        if self.checkout not in [t["path"] for t in self.trees]:
            raise Failure("Current directory is not a registered worktree")
        os.chdir(self.primary)  # the menu must not itself occupy a checkout being removed
        state_home = state_home or os.environ.get("XDG_STATE_HOME") or str(Path.home() / ".local/state")
        self.state_root = Path(state_home) / "rex-worktrees"
        digest = hashlib.sha256(str(self.primary).encode()).hexdigest()
        self.state_file = self.state_root / (digest + ".json")
        self.lock_file = self.state_root / (digest + ".lock")
        self.saved = {}

    @contextmanager
    def lock(self):
        self.state_root.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.lock_file.open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise Failure("Another worktree menu for this project is already open") from exc
            if self.state_file.exists():
                self.saved = json.loads(self.state_file.read_text())
                if not isinstance(self.saved, dict) or not all(
                        isinstance(k, str) and isinstance(v, str) for k, v in self.saved.items()):
                    raise Failure("Invalid worktree session state; refusing to guess")
            yield

    def save(self):
        with tempfile.NamedTemporaryFile(mode="w", dir=self.state_root, delete=False) as file:
            try:
                json.dump(self.saved, file)
                file.close()
                os.replace(file.name, self.state_file)
            finally:
                if os.path.exists(file.name):
                    os.unlink(file.name)

    def associations(self):
        live = self.rex.sessions()
        matches = {t["path"]: set() for t in self.trees}
        for path, session in self.saved.items():
            if session in live and Path(path) in matches and session != self.rex.helper:
                matches[Path(path)].add(session)
        for session in live:
            if session == self.rex.helper:
                continue
            for directory in self.rex.directories(session):
                if directory:
                    # Nested worktrees belong to their most specific root.
                    for root in sorted(matches, key=lambda p: len(str(p)), reverse=True):
                        if inside(directory, root):
                            actual = Path(git(directory, "rev-parse", "--show-toplevel").removesuffix("\n")).resolve()
                            if actual == root:
                                matches[root].add(session)
                            break
        return matches

    def open_path(self, path):
        self.trees = worktrees(self.primary)
        tree = next((t for t in self.trees if t["path"] == path), None)
        if not tree or "prunable" in tree or not path.is_dir():
            raise Failure("Worktree is unavailable; repair it with Git before reopening")
        sessions = self.associations()[path]
        if len(sessions) > 1:
            raise Failure("Several Rex sessions use this checkout; close duplicates before proceeding")
        if sessions:
            session = next(iter(sessions))
        else:
            name = tree["branch"] or "detached-" + tree.get("HEAD", "")[:8]
            label = slug(self.primary.name) + "-" + slug(name)
            # Labels are display names, never identity. Avoid cross-project label collisions too.
            if label in self.rex.sessions().values():
                label += "-" + hashlib.sha256(str(path).encode()).hexdigest()[:8]
            session = self.rex.create(label[:128], path)
        self.saved[str(path)] = session
        self.save()  # record before focusing so a focus failure cannot cause a duplicate
        self.rex.focus(session)
        return session

    def add_branch(self, branch, new=False):
        git(self.primary, "check-ref-format", "--branch", branch)
        # Reject checkout shorthand (@{-1}, etc.) even if --branch expands it.
        git(self.primary, "check-ref-format", "refs/heads/" + branch)
        self.trees = worktrees(self.primary)
        existing = next((t for t in self.trees if t["branch"] == branch), None)
        if existing:
            if new:
                raise Failure("Branch already exists; use Ctrl+B then Shift+O")
            return self.open_path(existing["path"])
        path = self.primary.parent / (slug(self.primary.name) + "-" + slug(branch))
        if path.exists() or path.is_symlink():
            raise Failure(f"Directory already exists; will not overwrite it: {path}")
        if new:
            git(self.primary, "show-ref", "--verify", "refs/heads/main")
            git(self.primary, "worktree", "add", "-b", branch, str(path), "main")
        else:
            git(self.primary, "worktree", "add", str(path), branch)
        # If session creation fails, keep the checkout/branch; Open can recover it.
        return self.open_path(path)

    def new(self):
        return self.add_branch(self.menu.branch(), new=True)

    def open(self):
        matches = self.associations()
        choices, checked_out = [], set()
        for tree in self.trees:
            branch = tree["branch"] or "detached-" + tree.get("HEAD", "")[:8]
            checked_out.add(tree["branch"])
            status = "session open" if matches[tree["path"]] else "session closed"
            if "locked" in tree or "prunable" in tree:
                status += "; locked/unavailable"
            choices.append((f"[worktree; {status}] {branch}  {tree['path']}", ("path", tree["path"])))
        branches = git(self.primary, "for-each-ref", "--format=%(refname:strip=2)", "refs/heads").splitlines()
        choices += [("[branch only; create worktree] " + b, ("branch", b))
                    for b in branches if b not in checked_out]
        kind, value = self.menu.pick(self.primary.name + ": existing worktrees and local branches", choices)
        return self.open_path(value) if kind == "path" else self.add_branch(value)

    def clean_target(self):
        self.trees = worktrees(self.primary)
        target = next((t for t in self.trees if t["path"] == self.checkout), None)
        if not target or target["path"] == self.primary:
            raise Failure("Never delete the primary checkout (or an unregistered directory)")
        if "locked" in target or "prunable" in target:
            raise Failure("Worktree is locked or unavailable; no sessions were closed")
        if git(self.checkout, "status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"):
            raise Failure("Worktree has modified, staged, or untracked files; nothing will be force-removed")
        # Git cannot remove worktrees containing submodules without --force. Refuse before teardown.
        if any(line.startswith("160000 ") for line in git(self.checkout, "ls-files", "--stage").splitlines()):
            raise Failure("Worktrees with submodules must be removed manually")
        return target

    def validate_source(self):
        if self.rex.helper == self.source:
            raise Failure("Deletion requires a separate menu session")
        if self.associations()[self.checkout] != {self.source}:
            raise Failure("The source session is missing or this checkout has multiple sessions")
        directories = self.rex.directories(self.source)
        if not directories or any(not d or not inside(d, self.checkout) for d in directories):
            raise Failure("Source session has unknown, remote, or unrelated terminal directories")
        for directory in directories:
            root = Path(git(directory, "rev-parse", "--show-toplevel").removesuffix("\n")).resolve()
            if root != self.checkout:
                raise Failure("Source session contains a terminal in another nested repository")

    def delete(self):
        target = self.clean_target()
        self.validate_source()
        choice = self.menu.pick(
            f"DELETE {visible(target['branch'] or 'detached')} at {visible(self.checkout)}? Branch is kept.",
            [("Cancel", False), ("Remove worktree and STOP ALL programs in its Rex session", True)])
        if not choice:
            raise Cancelled()
        # Revalidate after the confirmation, before stopping any program.
        self.clean_target()
        current = self.rex.block_directory(self.source, self.block)
        if not current or not inside(current, self.checkout):
            raise Failure("Source terminal changed directory; deletion cancelled")
        self.validate_source()
        self.rex.kill(self.source)
        if self.source in self.rex.sessions():
            raise Failure("Rex session is still running; checkout was not removed")
        self.clean_target()  # programs may have written files while shutting down
        git(self.primary, "worktree", "remove", str(self.checkout))  # deliberately no --force
        self.saved.pop(str(self.checkout), None)
        self.save()
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["new", "open", "delete"])
    parser.add_argument("source_session")
    parser.add_argument("source_block")
    parser.add_argument("client")
    parser.add_argument("directory")
    args = parser.parse_args()
    os.umask(0o077)
    rex = Rex(args.client)
    if not rex.helper or rex.helper == args.source_session:
        raise Failure("Launch with the Rex worktree keybindings, not in your working shell")
    destination = args.source_session
    try:
        for tool in ("git", "fzf"):
            if not shutil.which(tool):
                raise Failure(f"Missing command: {tool}")
        workflow = Workflow(args.directory, args.source_session, args.source_block, rex, Menu())
        with workflow.lock():
            destination = getattr(workflow, args.mode)()
    except (Cancelled, EOFError, KeyboardInterrupt):
        pass
    except (Failure, OSError, ValueError, KeyError) as exc:
        print("\nWorktree action stopped:", exc)
        print("If deletion stopped after closing a session, its checkout/branch remain. Use Open to recover.")
        try:
            input("Press Enter to close this menu.")
        except (EOFError, KeyboardInterrupt):
            pass
    finally:
        try:
            if destination and destination in rex.sessions():
                rex.focus(destination)
        finally:
            # Last operation: deleting our own temporary session terminates this process.
            rex.kill(rex.helper)


if __name__ == "__main__":
    try:
        main()
    except (Failure, OSError, ValueError) as exc:
        raise SystemExit(str(exc))

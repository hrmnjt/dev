"""Isolated Claude settings/identity tests; no host deployment or credentials."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
HOOK = ROOT / "_scripts/claude-web-git-identity.sh"


class ClaudeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="claude-test-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.home = self.base / "home"
        self.home.mkdir()
        self.repo = self.base / "repo with spaces"
        self.repo.mkdir()
        self.env_file = self.base / "claude.env"
        self.env_file.write_text("export OTHER_HOOK=preserved\n")
        # Never inherit the host's Git config, identity, credential helpers,
        # index/worktree overrides, or commit hooks.
        self.env = {
            k: v for k, v in os.environ.items()
            if not k.startswith(("GIT_", "CLAUDE_"))
            and k not in ("EMAIL", "XDG_CONFIG_HOME")
        }
        self.env.update({
            "HOME": str(self.home),
            "XDG_CONFIG_HOME": str(self.home / ".config"),
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "CLAUDE_CODE_REMOTE": "true",
            "CLAUDE_PROJECT_DIR": str(self.repo),
            "CLAUDE_ENV_FILE": str(self.env_file),
            "GIT_AUTHOR_NAME": "Claude",
            "GIT_AUTHOR_EMAIL": "noreply@anthropic.com",
            "GIT_COMMITTER_NAME": "Claude",
            "GIT_COMMITTER_EMAIL": "noreply@anthropic.com",
        })
        self.git("init", "-q")
        self.git("config", "user.name", "Claude")
        self.git("config", "user.email", "noreply@anthropic.com")
        self.identity = self.repo / "git/.config/git/config.personal"
        self.identity.parent.mkdir(parents=True)
        shutil.copyfile(ROOT / "git/.config/git/config.personal", self.identity)
        self.name = self.git("config", "--file", str(self.identity), "--get", "user.name").stdout.strip()
        self.email = self.git("config", "--file", str(self.identity), "--get", "user.email").stdout.strip()

    def git(self, *args):
        return subprocess.run(
            ["git", "-C", str(self.repo), *args], env=self.env,
            text=True, capture_output=True, check=True,
        )

    def hook(self, check=True):
        return subprocess.run(
            ["/bin/bash", str(HOOK)], env=self.env,
            text=True, capture_output=True, check=check,
        )

    def commit_with_claude_env(self):
        return subprocess.run(
            ["/bin/bash", "-c", '. "$CLAUDE_ENV_FILE"; '
             'test "$OTHER_HOOK" = preserved && '
             'git -C "$CLAUDE_PROJECT_DIR" commit -q --allow-empty -m identity-test'],
            env=self.env, text=True, capture_output=True, check=True,
        )

    def assert_identity(self):
        self.commit_with_claude_env()
        actual = self.git("show", "-s", "--format=%an%n%ae%n%cn%n%ce").stdout.splitlines()
        self.assertEqual(actual, [self.name, self.email, self.name, self.email])
        self.assertEqual(self.git("config", "--local", "--get", "user.useConfigOnly").stdout.strip(), "true")

    def test_web_author_and_committer(self):
        self.hook()
        self.assert_identity()
        self.hook()  # resumed sessions must be safe too
        self.assert_identity()
        self.assertFalse((self.home / ".gitconfig").exists())

    def test_local_is_noop(self):
        for remote in (None, "false"):
            if remote is None:
                self.env.pop("CLAUDE_CODE_REMOTE", None)
            else:
                self.env["CLAUDE_CODE_REMOTE"] = remote
            before = (self.repo / ".git/config").read_bytes()
            env_before = self.env_file.read_bytes()
            self.hook()
            self.assertEqual((self.repo / ".git/config").read_bytes(), before)
            self.assertEqual(self.env_file.read_bytes(), env_before)

    def test_shell_safe_identity(self):
        self.name = "O'Name $(touch should-not-exist); `false` \\\" quoted"
        self.email = "personal@example.com"
        self.git("config", "--file", str(self.identity), "user.name", self.name)
        self.git("config", "--file", str(self.identity), "user.email", self.email)
        self.hook()
        self.assert_identity()
        self.assertFalse((ROOT / "should-not-exist").exists())

    def test_linked_worktree(self):
        self.hook()
        self.commit_with_claude_env()
        linked = self.base / "linked tree"
        self.git("worktree", "add", "-q", "--detach", str(linked), "HEAD")
        # The fixture identity file is untracked, so copy it into the worktree.
        target = linked / "git/.config/git/config.personal"
        target.parent.mkdir(parents=True)
        shutil.copyfile(self.identity, target)
        self.repo = linked
        self.env["CLAUDE_PROJECT_DIR"] = str(linked)
        self.hook()
        self.assert_identity()

    def test_invalid_setup_does_not_write(self):
        before = (self.repo / ".git/config").read_bytes()
        env_before = self.env_file.read_bytes()
        self.identity.unlink()
        self.assertNotEqual(self.hook(check=False).returncode, 0)
        self.assertEqual((self.repo / ".git/config").read_bytes(), before)
        self.assertEqual(self.env_file.read_bytes(), env_before)

    def test_incomplete_identity_does_not_write(self):
        before = (self.repo / ".git/config").read_bytes()
        env_before = self.env_file.read_bytes()
        self.git("config", "--file", str(self.identity), "--unset", "user.email")
        self.assertNotEqual(self.hook(check=False).returncode, 0)
        self.assertEqual((self.repo / ".git/config").read_bytes(), before)
        self.assertEqual(self.env_file.read_bytes(), env_before)

    def test_missing_environment_file_does_not_write(self):
        before = (self.repo / ".git/config").read_bytes()
        self.env.pop("CLAUDE_ENV_FILE")
        self.assertNotEqual(self.hook(check=False).returncode, 0)
        self.assertEqual((self.repo / ".git/config").read_bytes(), before)

    def test_subdirectory_is_rejected(self):
        subdir = self.repo / "subdir"
        subdir.mkdir()
        self.env["CLAUDE_PROJECT_DIR"] = str(subdir)
        self.assertNotEqual(self.hook(check=False).returncode, 0)

    def test_settings_and_mac_fail_closed(self):
        user = json.loads((ROOT / "claude/.claude/settings.json").read_text())
        project = json.loads((ROOT / ".claude/settings.json").read_text())
        expected = {"commit": "", "pr": "", "sessionUrl": False}
        self.assertEqual(user["attribution"], expected)
        self.assertEqual(project["attribution"], expected)
        command = project["hooks"]["SessionStart"][0]["hooks"][0]["command"]
        self.assertEqual(command, '/bin/bash "$CLAUDE_PROJECT_DIR/_scripts/claude-web-git-identity.sh"')
        self.assertTrue(user["sandbox"]["enabled"])
        self.assertTrue(user["sandbox"]["failIfUnavailable"])
        self.env.update(user["env"])
        self.git("config", "--unset", "user.name")
        self.git("config", "--unset", "user.email")
        for key in list(self.env):
            if key.startswith(("GIT_AUTHOR_", "GIT_COMMITTER_")):
                del self.env[key]
        result = subprocess.run(
            ["git", "-C", str(self.repo), "commit", "-q", "--allow-empty", "-m", "must-fail"],
            env=self.env, capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("auto-detection is disabled", result.stderr)

    @unittest.skipUnless(shutil.which("stow"), "stow unavailable")
    def test_stow_keeps_runtime_directory_real(self):
        subprocess.run(
            ["stow", "--no-folding", "-d", str(ROOT), "-t", str(self.home), "claude"],
            env=self.env, capture_output=True, text=True, check=True,
        )
        directory = self.home / ".claude"
        self.assertTrue(directory.is_dir())
        self.assertFalse(directory.is_symlink())
        for filename in ("settings.json", "CLAUDE.md"):
            self.assertEqual((directory / filename).resolve(), ROOT / "claude/.claude" / filename)
        self.assertFalse((self.home / "README.md").exists())
        (directory / "history.jsonl").write_text("runtime\n")
        self.assertFalse((ROOT / "claude/.claude/history.jsonl").exists())


if __name__ == "__main__":
    unittest.main()

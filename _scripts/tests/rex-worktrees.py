#!/usr/bin/env python3
"""Disposable real-Git tests with a fake Rex server and menu; no host deployment."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("worktrees", ROOT / "rex/.config/rex/worktrees.py")
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


class FakeRex:
    helper = "session-menu"

    def __init__(self, primary):
        self.live = {"source": "main", self.helper: "menu"}
        self.paths = {"source": [str(primary)], self.helper: []}
        self.created, self.killed, self.focused = [], [], []
        self.after_kill = None
        self.create_failure = False
        self.focus_failure = False
        self.block_override = None

    def sessions(self):
        return dict(self.live)

    def directories(self, session):
        return list(self.paths[session])

    def block_directory(self, session, block):
        return self.block_override or self.paths[session][0]

    def create(self, label, path):
        if self.create_failure:
            raise w.Failure("creation failed")
        session = "created-" + str(len(self.created))
        self.live[session], self.paths[session] = label, [str(path)]
        self.created.append((session, label, path))
        return session

    def focus(self, session):
        if self.focus_failure:
            raise w.Failure("focus failed")
        self.focused.append(session)

    def kill(self, session):
        self.killed.append(session)
        del self.live[session]
        if self.after_kill:
            self.after_kill()


class FakeMenu:
    def __init__(self, branch="feature-a", selection=0, confirm=True, hook=None):
        self.name, self.selection, self.confirm, self.hook = branch, selection, confirm, hook
        self.rows = []

    def branch(self):
        return self.name

    def pick(self, title, choices):
        self.rows = choices
        if self.hook:
            self.hook()
        if title.startswith("DELETE"):
            return self.confirm
        return choices[self.selection][1]


class WorktreeTests(unittest.TestCase):
    def setUp(self):
        self.original = Path.cwd()
        self.tmp = tempfile.TemporaryDirectory(prefix="rex-worktrees-", dir=os.environ.get("TMPDIR"))
        self.root = Path(self.tmp.name).resolve()
        self.primary = self.root / "repo with spaces"
        self.primary.mkdir()
        w.git(self.primary, "init", "-b", "main")
        w.git(self.primary, "config", "user.name", "Fixture")
        w.git(self.primary, "config", "user.email", "fixture@example.invalid")
        (self.primary / "tracked").write_text("base\n")
        w.git(self.primary, "add", "tracked")
        w.git(self.primary, "commit", "-m", "fixture")
        self.base = w.git(self.primary, "rev-parse", "main").strip()
        self.rex = FakeRex(self.primary)
        self.state = self.root / "private state"

    def tearDown(self):
        os.chdir(self.original)
        self.tmp.cleanup()

    def workflow(self, directory=None, menu=None):
        return w.Workflow(directory or self.primary, "source", "block", self.rex,
                          menu or FakeMenu(), state_home=self.state)

    def linked(self, branch="feature-a"):
        path = self.root / ("repo-with-spaces-" + w.slug(branch))
        w.git(self.primary, "worktree", "add", "-b", branch, str(path), "main")
        return path

    def source_at(self, path):
        self.rex.paths["source"] = [str(path)]

    def test_new_uses_local_main_and_one_session(self):
        # Primary HEAD differs from main: new branches must still start at local main.
        w.git(self.primary, "checkout", "-b", "other")
        (self.primary / "tracked").write_text("other branch\n")
        w.git(self.primary, "commit", "-am", "other")
        flow = self.workflow()
        with flow.lock():
            flow.new()
        path = self.root / "repo-with-spaces-feature-a"
        self.assertEqual(w.git(path, "rev-parse", "HEAD").strip(), self.base)
        self.assertEqual(len(self.rex.created), 1)
        self.assertEqual(self.rex.created[0][1], "repo-with-spaces-feature-a")
        self.assertEqual(self.rex.created[0][2], path)

    def test_new_preserves_branch_slashes_but_generated_names_use_hyphens(self):
        flow = self.workflow(menu=FakeMenu(branch="feat/rex/example"))
        with flow.lock():
            flow.new()
        path = self.root / "repo-with-spaces-feat-rex-example"
        self.assertEqual(w.git(path, "symbolic-ref", "--short", "HEAD").strip(), "feat/rex/example")
        self.assertEqual(self.rex.created[0][1], "repo-with-spaces-feat-rex-example")

    def test_open_adopts_existing_session_and_no_duplicates(self):
        path = self.linked()
        self.rex.live["manual"] = "manually named"
        self.rex.paths["manual"] = [str(path)]
        flow = self.workflow()
        with flow.lock():
            self.assertEqual(flow.open_path(path), "manual")
            self.assertEqual(flow.open_path(path), "manual")
        self.assertFalse(self.rex.created)
        self.assertEqual(len(w.worktrees(self.primary)), 2)

    def test_open_reopens_closed_session(self):
        path = self.linked()
        flow = self.workflow()
        with flow.lock():
            first = flow.open_path(path)
            self.rex.kill(first)
            second = flow.open_path(path)
        self.assertNotEqual(first, second)
        self.assertEqual(len(w.worktrees(self.primary)), 2)

    def test_existing_branch_creates_checkout_without_reset(self):
        w.git(self.primary, "branch", "local-only")
        flow = self.workflow()
        with flow.lock():
            flow.add_branch("local-only")
            flow.add_branch("local-only")
        self.assertEqual(len(self.rex.created), 1)
        self.assertEqual(len(w.worktrees(self.primary)), 2)

    def test_picker_differentiates_worktrees_and_local_branches(self):
        path = self.linked()
        w.git(self.primary, "branch", "local-only")
        menu = FakeMenu(selection=1)
        flow = self.workflow(menu=menu)
        with flow.lock():
            flow.open()
        labels = [label for label, _ in menu.rows]
        self.assertTrue(any("worktree; session open" in x and "main" in x for x in labels))
        self.assertTrue(any("worktree; session closed" in x and "feature-a" in x for x in labels))
        self.assertIn("[branch only; create worktree] local-only", labels)
        self.assertEqual(self.rex.created[0][2], path)

    def test_registry_survives_renaming_and_changing_directory(self):
        path = self.linked()
        flow = self.workflow()
        with flow.lock():
            session = flow.open_path(path)
        self.rex.live[session] = "renamed"
        self.rex.paths[session] = [str(self.root)]
        fresh = self.workflow()
        with fresh.lock():
            self.assertEqual(fresh.open_path(path), session)
        self.assertEqual(len(self.rex.created), 1)

    def test_duplicate_existing_sessions_fail_closed(self):
        path = self.linked()
        for session in ("a", "b"):
            self.rex.live[session], self.rex.paths[session] = session, [str(path)]
        flow = self.workflow()
        with flow.lock(), self.assertRaisesRegex(w.Failure, "Several Rex sessions"):
            flow.open_path(path)
        self.assertFalse(self.rex.created)

    def test_name_collision_does_not_overwrite(self):
        w.git(self.primary, "branch", "feature/a")
        occupied = self.root / "repo-with-spaces-feature-a"
        occupied.mkdir()
        (occupied / "keep").write_text("keep")
        flow = self.workflow()
        with flow.lock(), self.assertRaisesRegex(w.Failure, "Directory already exists"):
            flow.add_branch("feature/a")
        self.assertEqual((occupied / "keep").read_text(), "keep")

    def test_invalid_new_names_and_missing_main(self):
        for branch in ("--force", "a..b", "trailing/", "a;touch bad", "", "@{-1}"):
            flow = self.workflow(menu=FakeMenu(branch=branch))
            with flow.lock(), self.assertRaises(w.Failure):
                flow.new()
        w.git(self.primary, "branch", "-m", "main", "other")
        flow = self.workflow()
        with flow.lock(), self.assertRaises(w.Failure):
            flow.new()
        self.assertEqual(len(w.worktrees(self.primary)), 1)

    def test_primary_checkout_never_deleted_even_off_main(self):
        w.git(self.primary, "checkout", "-b", "other")
        flow = self.workflow()
        with flow.lock(), self.assertRaisesRegex(w.Failure, "primary checkout"):
            flow.delete()
        self.assertFalse(self.rex.killed)

    def test_dirty_staged_untracked_refused_before_kill(self):
        path = self.linked()
        self.source_at(path)
        for kind in ("modified", "staged", "untracked"):
            with self.subTest(kind=kind):
                if kind == "untracked":
                    (path / "untracked").write_text("keep")
                else:
                    (path / "tracked").write_text("keep")
                    if kind == "staged":
                        w.git(path, "add", "tracked")
                flow = self.workflow(path)
                with flow.lock(), self.assertRaisesRegex(w.Failure, "modified, staged, or untracked"):
                    flow.delete()
                self.assertFalse(self.rex.killed)
                w.git(path, "reset", "--hard", "HEAD")  # fixture only
        self.assertTrue((path / "untracked").exists())

    def test_delete_retains_branch_and_stops_session_first(self):
        path = self.linked()
        self.source_at(path)
        self.rex.after_kill = lambda: self.assertTrue(path.is_dir())
        flow = self.workflow(path)
        with flow.lock():
            flow.delete()
        self.assertEqual(self.rex.killed, ["source"])
        self.assertFalse(path.exists())
        self.assertEqual(w.git(self.primary, "rev-parse", "feature-a").strip(), self.base)
        self.assertEqual(len(w.worktrees(self.primary)), 1)

    def test_cancel_delete_leaves_everything(self):
        path = self.linked()
        self.source_at(path)
        flow = self.workflow(path, FakeMenu(confirm=False))
        with flow.lock(), self.assertRaises(w.Cancelled):
            flow.delete()
        self.assertTrue(path.exists())
        self.assertFalse(self.rex.killed)

    def test_new_files_during_confirmation_block_teardown(self):
        path = self.linked()
        self.source_at(path)
        menu = FakeMenu(hook=lambda: (path / "new-file").write_text("keep"))
        flow = self.workflow(path, menu)
        with flow.lock(), self.assertRaises(w.Failure):
            flow.delete()
        self.assertFalse(self.rex.killed)
        self.assertTrue(path.exists())

    def test_new_files_during_shutdown_preserve_checkout(self):
        path = self.linked()
        self.source_at(path)
        self.rex.after_kill = lambda: (path / "new-file").write_text("keep")
        flow = self.workflow(path)
        with flow.lock(), self.assertRaises(w.Failure):
            flow.delete()
        self.assertEqual(self.rex.killed, ["source"])
        self.assertEqual((path / "new-file").read_text(), "keep")

    def test_locked_worktree_and_mixed_session_refused(self):
        path = self.linked()
        self.source_at(path)
        w.git(self.primary, "worktree", "lock", str(path))
        flow = self.workflow(path)
        with flow.lock(), self.assertRaisesRegex(w.Failure, "locked"):
            flow.delete()
        w.git(self.primary, "worktree", "unlock", str(path))
        self.rex.paths["source"].append(str(self.primary))
        flow = self.workflow(path)
        with flow.lock(), self.assertRaisesRegex(w.Failure, "unrelated"):
            flow.delete()
        self.assertFalse(self.rex.killed)

    def test_changed_source_block_directory_refused(self):
        path = self.linked()
        self.source_at(path)
        self.rex.block_override = str(self.primary)
        flow = self.workflow(path)
        with flow.lock(), self.assertRaisesRegex(w.Failure, "changed directory"):
            flow.delete()
        self.assertFalse(self.rex.killed)

    def test_session_failure_keeps_worktree_and_focus_failure_no_duplicate(self):
        self.rex.create_failure = True
        flow = self.workflow()
        with flow.lock(), self.assertRaises(w.Failure):
            flow.new()
        path = self.root / "repo-with-spaces-feature-a"
        self.assertTrue(path.exists())
        self.rex.create_failure, self.rex.focus_failure = False, True
        flow = self.workflow()
        with flow.lock(), self.assertRaises(w.Failure):
            flow.open_path(path)
        self.rex.focus_failure = False
        fresh = self.workflow()
        with fresh.lock():
            fresh.open_path(path)
        self.assertEqual(len(self.rex.created), 1)

    def test_submodule_worktree_refused_before_session_teardown(self):
        path = self.linked()
        self.source_at(path)
        w.git(path, "update-index", "--add", "--cacheinfo", "160000," + self.base + ",submodule")
        w.git(path, "commit", "-m", "fixture gitlink")
        (path / "submodule").mkdir()  # a clean, uninitialized submodule checkout
        flow = self.workflow(path)
        with flow.lock(), self.assertRaisesRegex(w.Failure, "submodules"):
            flow.delete()
        self.assertFalse(self.rex.killed)
        self.assertTrue(path.exists())

    def test_unknown_terminal_and_late_unrelated_tab_refused(self):
        path = self.linked()
        self.source_at(path)
        self.rex.paths["source"].append(None)
        flow = self.workflow(path)
        with flow.lock(), self.assertRaisesRegex(w.Failure, "unknown, remote"):
            flow.delete()
        self.rex.paths["source"].pop()
        menu = FakeMenu(hook=lambda: self.rex.paths["source"].append(str(self.primary)))
        flow = self.workflow(path, menu)
        with flow.lock(), self.assertRaisesRegex(w.Failure, "unrelated"):
            flow.delete()
        self.assertFalse(self.rex.killed)

    def test_nested_repository_not_adopted_as_parent_session(self):
        path = self.linked()
        nested = path / "nested"
        nested.mkdir()
        w.git(nested, "init", "-b", "main")
        self.rex.live["nested"] = "unrelated nested repo"
        self.rex.paths["nested"] = [str(nested)]
        flow = self.workflow()
        with flow.lock():
            self.assertNotIn("nested", flow.associations()[path])

    def test_project_lock_and_bad_state_fail_closed(self):
        first, second = self.workflow(), self.workflow()
        with first.lock(), self.assertRaisesRegex(w.Failure, "already open"):
            with second.lock():
                pass
        first.state_file.write_text('["bad state"]')
        with self.assertRaisesRegex(w.Failure, "Invalid worktree session state"):
            with self.workflow().lock():
                pass


if __name__ == "__main__":
    unittest.main(verbosity=2)

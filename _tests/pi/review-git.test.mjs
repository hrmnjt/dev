import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createReviewIndex, diffArgs, reviewGit } from "../../pi/.pi/agent/extensions/lib/review-git.ts";

function fixture(t, commit = true) {
  const parent = mkdtempSync(path.join(tmpdir(), "review-git-test-"));
  const dir = path.join(parent, "repo"), scratch = path.join(parent, "scratch");
  mkdirSync(dir); mkdirSync(scratch);
  const oldTmp = process.env.TMPDIR;
  process.env.TMPDIR = scratch;
  t.after(() => {
    if (oldTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = oldTmp;
    rmSync(parent, { recursive: true, force: true });
  });
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_OPTIONAL_LOCKS: "0" };
  for (const key of Object.keys(env)) if (/^GIT_(AUTHOR_|COMMITTER_|CONFIG_(COUNT|KEY_|VALUE_|PARAMETERS)|DIR$|WORK_TREE$|INDEX_FILE$|COMMON_DIR$|OBJECT_DIRECTORY$|ALTERNATE_OBJECT_DIRECTORIES$)/.test(key)) delete env[key];
  const git = (args, cwd = dir, runEnv = env) => {
    const r = spawnSync("git", args, { cwd, env: runEnv, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trimEnd();
  };
  const save = (name, text) => writeFileSync(path.join(dir, name), text);
  git(["init", "-q", "-b", "main", "--template="]);
  if (commit) {
    save("tracked.txt", "initial\n"); save("removed.txt", "keep staged deletion\n"); save(".gitignore", "ignored.txt\n");
    git(["add", "."]);
    git(["-c", "user.name=Review fixture", "-c", "user.email=review@fixture.invalid", "commit", "-qm", "initial"]);
  }
  const indexPath = () => git(["rev-parse", "--path-format=absolute", "--git-path", "index"]);
  const bytes = () => existsSync(indexPath()) ? readFileSync(indexPath()) : null;
  return { dir, env, git, save, indexPath, bytes };
}

for (const kind of ["head", "unstaged", "base"]) test(`${kind} exposes untracked files without changing staging or the real index`, t => {
  const f = fixture(t);
  f.save("tracked.txt", "staged\n"); f.git(["add", "tracked.txt"]); f.save("tracked.txt", "staged\nunstaged\n");
  const names = ["new file.txt", ":literal.txt", "[glob].txt", "unicode-λ.txt", "line\nbreak.txt"];
  for (const name of names) f.save(name, "untracked content\n");
  f.save("ignored.txt", "not reviewed\n");
  f.git(["rm", "--cached", "removed.txt"]); // File remains on disk: don't undo its staged deletion.
  const before = f.bytes(), staged = f.git(["diff", "--cached"]);
  const target = kind === "base" ? { kind, base: "main" } : { kind };
  const index = createReviewIndex(f.dir, target, f.env);
  const temp = path.dirname(index.env.GIT_INDEX_FILE);
  try {
    const diff = reviewGit(f.dir, diffArgs(target), index.env);
    assert.match(diff, /untracked content/); assert.doesNotMatch(diff, /not reviewed/);
    const added = f.git(["ls-files", "-z"], f.dir, index.env).split("\0");
    for (const name of names) assert.ok(added.includes(name), name);
    assert.ok(!added.includes("removed.txt"));
    assert.deepEqual(f.bytes(), before);
    assert.equal(f.git(["diff", "--cached"]), staged);
  } finally { index.cleanup(); index.cleanup(); }
  assert.equal(existsSync(temp), false);
  assert.deepEqual(f.bytes(), before);
});

for (const kind of ["staged", "range"]) test(`${kind} uses a read-only real index and omits untracked files`, t => {
  const f = fixture(t); f.save("tracked.txt", "staged\n"); f.git(["add", "tracked.txt"]); f.save("new.txt", "untracked\n");
  const before = f.bytes();
  const target = kind === "range" ? { kind, range: "main...HEAD" } : { kind };
  const index = createReviewIndex(f.dir, target, f.env);
  assert.equal(index.env.GIT_INDEX_FILE, undefined); assert.equal(index.env.GIT_OPTIONAL_LOCKS, "0");
  assert.doesNotMatch(reviewGit(f.dir, diffArgs(target), index.env), /untracked/);
  index.cleanup(); assert.deepEqual(f.bytes(), before);
});

test("base compares with the merge base, including working changes but not newer main commits", t => {
  const f = fixture(t); f.git(["switch", "-qc", "feature"]); f.save("feature.txt", "feature\n"); f.git(["add", "."]);
  const commit = msg => f.git(["-c", "user.name=Review fixture", "-c", "user.email=review@fixture.invalid", "commit", "-qm", msg]);
  commit("feature"); f.git(["switch", "-q", "main"]); f.save("main-only.txt", "main only\n"); f.git(["add", "."]); commit("main advances"); f.git(["switch", "-q", "feature"]);
  f.save("tracked.txt", "working edit\n");
  const index = createReviewIndex(f.dir, { kind: "base", base: "main" }, f.env);
  try {
    const diff = reviewGit(f.dir, diffArgs({ kind: "base", base: "main" }), index.env);
    assert.match(diff, /feature.txt/); assert.match(diff, /working edit/); assert.doesNotMatch(diff, /main-only/);
  } finally { index.cleanup(); }
});

test("revision names can also be filenames, but cannot inject diff options", t => {
  const f = fixture(t); writeFileSync(path.join(f.dir, "main"), "branch-named file\n");
  const index = createReviewIndex(f.dir, { kind: "base", base: "main" }, f.env);
  try { assert.match(reviewGit(f.dir, diffArgs({ kind: "base", base: "main" }), index.env), /branch-named file/); }
  finally { index.cleanup(); }
  for (const target of [{ kind: "base", base: "--output=bad" }, { kind: "range", range: "--output=bad" }]) {
    assert.throws(() => diffArgs(target), /must not start/);
  }
});

test("linked worktrees use their own index and leave both indexes unchanged", t => {
  const f = fixture(t), linked = `${f.dir}-linked`;
  t.after(() => rmSync(linked, { recursive: true, force: true }));
  f.git(["worktree", "add", "-q", "-b", "linked", linked]);
  writeFileSync(path.join(linked, "new.txt"), "linked addition\n");
  const real = f.git(["rev-parse", "--path-format=absolute", "--git-path", "index"], linked);
  const before = readFileSync(real), main = f.bytes();
  const index = createReviewIndex(linked, { kind: "head" }, f.env);
  try { assert.match(reviewGit(linked, diffArgs({ kind: "head" }), index.env), /linked addition/); }
  finally { index.cleanup(); }
  assert.deepEqual(readFileSync(real), before); assert.deepEqual(f.bytes(), main);
});

test("split indexes and an explicit alternate index are supported", t => {
  const f = fixture(t); f.git(["update-index", "--split-index"]); f.save("new.txt", "addition\n");
  const before = f.bytes(), alternate = path.join(f.dir, "alternate-index"); copyFileSync(f.indexPath(), alternate);
  const env = { ...f.env, GIT_INDEX_FILE: alternate };
  const selected = readFileSync(alternate), index = createReviewIndex(f.dir, { kind: "head" }, env);
  try { assert.match(reviewGit(f.dir, diffArgs({ kind: "head" }), index.env), /addition/); }
  finally { index.cleanup(); }
  assert.deepEqual(f.bytes(), before); assert.deepEqual(readFileSync(alternate), selected);
});

test("unstaged review can prepare a missing index without creating the real index", t => {
  const f = fixture(t, false); f.save("new.txt", "first file\n");
  const index = createReviewIndex(f.dir, { kind: "unstaged" }, f.env);
  try { assert.match(reviewGit(f.dir, diffArgs({ kind: "unstaged" }), index.env), /first file/); }
  finally { index.cleanup(); }
  assert.equal(f.bytes(), null);
});

test("project-local TMPDIR does not make the private review index appear as an untracked change", t => {
  const f = fixture(t), cache = path.join(f.dir, "cache");
  mkdirSync(cache); writeFileSync(path.join(cache, "user.txt"), "user cache file\n");
  process.env.TMPDIR = cache;
  const before = f.bytes(), index = createReviewIndex(f.dir, { kind: "head" }, f.env);
  try {
    const diff = reviewGit(f.dir, diffArgs({ kind: "head" }), index.env);
    assert.match(diff, /user cache file/); assert.doesNotMatch(diff, /pi-review-index-/);
  } finally { index.cleanup(); }
  assert.deepEqual(f.bytes(), before);
});

test("invalid revisions and index preparation failures are errors, not empty reviews; cleanup is idempotent", t => {
  const f = fixture(t), before = f.bytes();
  const index = createReviewIndex(f.dir, { kind: "base", base: "missing-branch" }, f.env);
  try { assert.throws(() => reviewGit(f.dir, diffArgs({ kind: "base", base: "missing-branch" }), index.env), /missing-branch/); }
  finally { index.cleanup(); }
  const pending = () => readdirSync(tmpdir()).filter(name => name.startsWith("pi-review-index-")).sort();
  const old = pending();
  assert.throws(() => createReviewIndex(path.join(f.dir, "absent"), { kind: "head" }, f.env), /git/);
  const bad = { ...f.env, GIT_CONFIG_COUNT: "invalid" };
  assert.throws(() => createReviewIndex(f.dir, { kind: "head" }, bad), /git/);
  assert.deepEqual(pending(), old); assert.deepEqual(f.bytes(), before);
});

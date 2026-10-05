import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

// Exercise only the real Stow diagnostic, without Git, Brew, or host checks.
const script = await fs.readFile(new URL("../../_scripts/doctor.sh", import.meta.url), "utf8");
const start = script.indexOf("check_stow_links() {");
const end = script.indexOf("\ncheck_host_git_identity() {", start);
assert.ok(start >= 0 && end > start);
const check = script.slice(start, end);

for (const kind of ["file link", "folded directory", "unmanaged file", "missing file", "dangling link", "wrong target"]) {
  test(`Stow doctor: ${kind}`, async () => {
    const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "doctor-stow-test-")));
    try {
      const root = path.join(base, "checkout"), home = path.join(base, "home");
      const sourceDir = path.join(root, "glow/.config/glow/themes");
      const targetDir = path.join(home, ".config/glow/themes");
      const source = path.join(sourceDir, "style.json"), target = path.join(targetDir, "style.json");
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.writeFile(source, "{}");
      // Repository-local helpers and package guides must not require deployment.
      await fs.mkdir(path.join(root, "_tests"));
      await fs.writeFile(path.join(root, "_tests/local.txt"), "local");
      await fs.writeFile(path.join(root, "glow/README.md"), "guide");
      await fs.mkdir(path.dirname(targetDir), { recursive: true });
      if (kind === "folded directory") {
        await fs.symlink(sourceDir, targetDir);
      } else {
        await fs.mkdir(targetDir);
        if (kind === "file link") await fs.symlink(source, target);
        if (kind === "unmanaged file") await fs.writeFile(target, "{}");
        if (kind === "dangling link") await fs.symlink(path.join(base, "absent"), target);
        if (kind === "wrong target") {
          const wrong = path.join(base, "other-style.json");
          await fs.writeFile(wrong, "{}");
          await fs.symlink(wrong, target);
        }
      }
      const output = execFileSync("/bin/sh", ["-c", `
        set -eu
        pass() { printf 'PASSED: %s\\n' "$1"; }
        fail() { printf 'FAILED: %s\\n' "$1"; }
        ${check}
        check_stow_links
      `], { encoding: "utf8", env: { ...process.env, ROOT: root, HOME: home, TEMP_ROOT: base } });
      if (["file link", "folded directory"].includes(kind)) {
        assert.match(output, /^PASSED: Stow deployment links$/m);
        assert.doesNotMatch(output, /FAILED/);
      } else {
        assert.match(output, /FAILED: Stow deployment links \(1 problem/);
        const reason = kind === "dangling link" ? "dangling link" : kind === "wrong target" ? "wrong link target" : "missing link";
        assert.ok(output.includes(`${reason}: ${target}`), output);
      }
    } finally {
      await fs.rm(base, { recursive: true, force: true });
    }
  });
}

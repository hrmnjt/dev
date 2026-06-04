/**
 * UV Extension - Redirects Python tooling to uv equivalents
 *
 * This extension provides command interception utilities that block common
 * Python tooling commands (pip, poetry, python -m pip/venv/py_compile) and
 * redirect users to use uv instead.
 *
 * It exports utilities used by the gondolin extension to inject uv
 * interception into the VM-sandboxed bash tool, and also registers a
 * /uv-help slash command for quick uv command reference.
 *
 * Intercepted commands:
 *   pip/pip3  → uv add / uv run --with
 *   poetry    → uv init / uv add / uv sync / uv run
 *   python -m pip        → uv add / uv run --with
 *   python -m venv       → uv venv
 *   python -m py_compile → uv run python -m ast (no bytecode pollution)
 *
 * The interception works at the command-text level via spawnHook, catching
 * both bare commands and explicit-path invocations (.venv/bin/pip, etc.).
 *
 * Based on: https://github.com/mitsuhiko/agent-stuff/blob/main/extensions/uv.ts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Command detection
// ---------------------------------------------------------------------------

/**
 * Check a bash command for disallowed python-tooling invocations.
 * Returns a human-readable error message with uv alternatives, or null
 * if the command is allowed.
 */
export function getBlockedCommandMessage(command: string): string | null {
  // Match commands at the start of a shell segment (start/newline/; /&& /|| /|)
  // The patterns accept optional path prefixes to catch explicit invocations
  // like .venv/bin/pip or ./node_modules/.bin/poetry.

  const pipPattern = /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?pip\s*(?:$|\s)/m;
  const pip3Pattern = /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?pip3\s*(?:$|\s)/m;
  const poetryPattern = /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?poetry\s*(?:$|\s)/m;
  const pythonPipPattern =
    /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?python(?:3(?:\.\d+)?)?\b[^\n;|&]*(?:\s-m\s*pip\b|\s-mpip\b)/m;
  const pythonVenvPattern =
    /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?python(?:3(?:\.\d+)?)?\b[^\n;|&]*(?:\s-m\s*venv\b|\s-mvenv\b)/m;
  const pythonPyCompilePattern =
    /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?python(?:3(?:\.\d+)?)?\b[^\n;|&]*(?:\s-m\s*py_compile\b|\s-mpy_compile\b)/m;

  if (pipPattern.test(command)) {
    return [
      "pip is disabled. Use uv instead:",
      "",
      "  To install a package for a one-off script:",
      "    uv run --with PACKAGE python script.py",
      "",
      "  To add a dependency to the project:",
      "    uv add PACKAGE",
      "",
    ].join("\n");
  }

  if (pip3Pattern.test(command)) {
    return [
      "pip3 is disabled. Use uv instead:",
      "",
      "  To install a package for a one-off script:",
      "    uv run --with PACKAGE python script.py",
      "",
      "  To add a dependency to the project:",
      "    uv add PACKAGE",
      "",
    ].join("\n");
  }

  if (poetryPattern.test(command)) {
    return [
      "poetry is disabled. Use uv instead:",
      "",
      "  Initialize a project:    uv init",
      "  Add a dependency:         uv add PACKAGE",
      "  Sync dependencies:        uv sync",
      "  Run a command:            uv run COMMAND",
      "  Run with a package:       uv run --with PACKAGE python script.py",
      "",
    ].join("\n");
  }

  if (pythonPipPattern.test(command)) {
    return [
      "'python -m pip' is disabled. Use uv instead:",
      "",
      "  To install a package for a one-off script:",
      "    uv run --with PACKAGE python script.py",
      "",
      "  To add a dependency to the project:",
      "    uv add PACKAGE",
      "",
    ].join("\n");
  }

  if (pythonVenvPattern.test(command)) {
    return [
      "'python -m venv' is disabled. Use uv instead:",
      "",
      "  To create a virtual environment:",
      "    uv venv",
      "",
    ].join("\n");
  }

  if (pythonPyCompilePattern.test(command)) {
    return [
      "'python -m py_compile' is disabled (writes .pyc files to __pycache__).",
      "",
      "  To verify syntax without bytecode output:",
      "    uv run python -m ast path/to/file.py >/dev/null",
      "",
    ].join("\n");
  }

  return null;
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // Register a /uv-help slash command for quick uv reference
  pi.registerCommand("uv-help", {
    description: "Show uv command reference (replaces pip/poetry)",
    handler: async (_args, _ctx) => {
      const help = [
        "# uv — Python package & project manager (replaces pip, poetry, venv)",
        "",
        "## Project management",
        "| Task | uv command |",
        "|------|-----------|",
        "| Create a new project | `uv init` |",
        "| Add a dependency | `uv add PACKAGE` |",
        "| Add a dev dependency | `uv add --dev PACKAGE` |",
        "| Remove a dependency | `uv remove PACKAGE` |",
        "| Sync dependencies | `uv sync` |",
        "| Run a command | `uv run COMMAND` |",
        "| Run with a package | `uv run --with PACKAGE python script.py` |",
        "| Create a venv | `uv venv` |",
        "| Lock dependencies | `uv lock` |",
        "| Upgrade a package | `uv lock --upgrade-package PACKAGE` |",
        "",
        "## pip → uv mapping",
        "| pip command | uv equivalent |",
        "|------------|--------------|",
        "| `pip install pkg` | `uv add pkg` (project) or `uv run --with pkg python ...` (one-off) |",
        "| `pip install -r requirements.txt` | `uv add -r requirements.txt` |",
        "| `pip uninstall pkg` | `uv remove pkg` |",
        "| `pip list` | `uv pip list` |",
        "| `pip freeze` | `uv pip freeze` |",
        "| `pip install -e .` | `uv add --editable .` |",
        "",
        "## poetry → uv mapping",
        "| poetry command | uv equivalent |",
        "|---------------|--------------|",
        "| `poetry init` | `uv init` |",
        "| `poetry add pkg` | `uv add pkg` |",
        "| `poetry add --dev pkg` | `uv add --dev pkg` |",
        "| `poetry remove pkg` | `uv remove pkg` |",
        "| `poetry install` | `uv sync` |",
        "| `poetry run cmd` | `uv run cmd` |",
        "| `poetry shell` | `uv venv && source .venv/bin/activate` |",
        "",
        "## venv → uv mapping",
        "| venv command | uv equivalent |",
        "|-------------|--------------|",
        "| `python -m venv .venv` | `uv venv` |",
        "| `source .venv/bin/activate` | `uv run ...` (no activation needed) |",
      ].join("\n");

      pi.sendUserMessage(help);
    },
  });
}

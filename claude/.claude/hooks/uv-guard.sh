#!/bin/sh

# Claude Code PreToolUse hook for Bash: keep Python work uv-first.
# Mirrors pi/.pi/agent/extensions/uv.ts. Exit 2 blocks the command and returns
# stderr to Claude; any other exit leaves the normal permission flow in charge.

set -u

command=$(jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
[ -n "$command" ] || exit 0

# A tool invocation at the start of a shell segment, optionally path-qualified.
segment='(^|[;&|])[[:space:]]*([^[:space:]]*/)?'
python_module="${segment}python(3(\\.[0-9]+)?)?([[:space:]][^;&|]*)?[[:space:]]-m[[:space:]]*"

matches() {
  printf '%s\n' "$command" | grep -Eq "$1"
}

block() {
  printf '%s\n' "$@" >&2
  exit 2
}

if matches "${segment}pip3?([[:space:]]|$)" || matches "${python_module}pip([^[:alnum:]_]|$)"; then
  block "pip is disabled. Use uv instead:" \
    "  One-off script dependency:  uv run --with PACKAGE python script.py" \
    "  Project dependency:         uv add PACKAGE"
fi

if matches "${segment}poetry([[:space:]]|$)"; then
  block "poetry is disabled. Use uv instead:" \
    "  uv init | uv add PACKAGE | uv sync | uv run COMMAND"
fi

if matches "${python_module}venv([^[:alnum:]_]|$)"; then
  block "'python -m venv' is disabled. Use: uv venv"
fi

if matches "${python_module}py_compile([^[:alnum:]_]|$)"; then
  block "'python -m py_compile' is disabled (writes __pycache__)." \
    "  Check syntax with: uv run python -m ast path/to/file.py >/dev/null"
fi

exit 0

#!/bin/sh
set -eu

: "${HERDR_BIN_PATH:?Herdr did not provide HERDR_BIN_PATH}"
: "${HERDR_PLUGIN_EVENT:?Herdr did not provide HERDR_PLUGIN_EVENT}"
: "${HERDR_PLUGIN_EVENT_JSON:?Herdr did not provide HERDR_PLUGIN_EVENT_JSON}"
: "${HERDR_WORKSPACE_ID:?Herdr did not provide HERDR_WORKSPACE_ID}"
: "${HERDR_TAB_ID:?Herdr did not provide HERDR_TAB_ID}"

case "$HERDR_PLUGIN_EVENT" in
  worktree.created)
    ;;
  worktree.opened)
    # Opening an already-open workspace only focuses it; do not duplicate its tabs.
    if [ "$(printf '%s\n' "$HERDR_PLUGIN_EVENT_JSON" | jq -r '.data.already_open // false')" = "true" ]; then
      exit 0
    fi
    ;;
  *)
    printf 'unsupported plugin event: %s\n' "$HERDR_PLUGIN_EVENT" >&2
    exit 1
    ;;
esac

worktree_path=$(printf '%s\n' "$HERDR_PLUGIN_EVENT_JSON" | jq -er '.data.worktree.path')

"$HERDR_BIN_PATH" tab rename "$HERDR_TAB_ID" shell >/dev/null

created_tab=$(
  "$HERDR_BIN_PATH" tab create \
    --workspace "$HERDR_WORKSPACE_ID" \
    --cwd "$worktree_path" \
    --label pi \
    --focus
)
pi_pane=$(printf '%s\n' "$created_tab" | jq -er '.result.root_pane.pane_id')

"$HERDR_BIN_PATH" pane run "$pi_pane" pi >/dev/null

created_tab=$(
  "$HERDR_BIN_PATH" tab create \
    --workspace "$HERDR_WORKSPACE_ID" \
    --cwd "$worktree_path" \
    --label nvim
)
nvim_pane=$(printf '%s\n' "$created_tab" | jq -er '.result.root_pane.pane_id')

"$HERDR_BIN_PATH" pane run "$nvim_pane" nvim >/dev/null
printf 'created shell, pi, and nvim tabs in workspace %s\n' "$HERDR_WORKSPACE_ID"

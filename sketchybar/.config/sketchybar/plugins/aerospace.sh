#!/usr/bin/env bash

source "$CONFIG_DIR/colors.sh"

workspace="$1"
focused_workspace="${FOCUSED_WORKSPACE:-$(aerospace list-workspaces --focused)}"
window_count="$(aerospace list-windows --workspace "$workspace" --count)"

if [[ "$workspace" == "$focused_workspace" ]]; then
  sketchybar --set "$NAME" \
    icon.color="$BAR_COLOR" \
    background.color="$YELLOW_COLOR" \
    background.border_color="$YELLOW_COLOR" \
    background.drawing=on
elif (( window_count > 0 )); then
  sketchybar --set "$NAME" \
    icon.color="$TEXT_COLOR" \
    background.color="$SURFACE_ALT_COLOR" \
    background.border_color="$BORDER_COLOR" \
    background.drawing=on
else
  sketchybar --set "$NAME" \
    icon.color="$MUTED_COLOR" \
    background.drawing=off
fi

#!/usr/bin/env bash

source "$CONFIG_DIR/colors.sh"

battery_status="$(pmset -g batt)"
percentage="$(printf '%s\n' "$battery_status" | grep -Eo '[0-9]+%' | head -n 1 | tr -d '%')"

if [[ -z "$percentage" ]]; then
  sketchybar --set "$NAME" drawing=off
  exit 0
fi

case "$percentage" in
  9[0-9]|100) icon="" ;;
  [6-8][0-9]) icon="" ;;
  [3-5][0-9]) icon="" ;;
  [1-2][0-9]) icon="" ;;
  *) icon="" ;;
esac

color="$TEXT_COLOR"
if [[ "$battery_status" == *"AC Power"* ]]; then
  icon=""
elif (( percentage <= 15 )); then
  color="$RED_COLOR"
elif (( percentage <= 30 )); then
  color="$YELLOW_COLOR"
fi

sketchybar --set "$NAME" \
  drawing=on \
  icon="$icon" \
  icon.color="$color" \
  label="${percentage}%" \
  label.color="$color"

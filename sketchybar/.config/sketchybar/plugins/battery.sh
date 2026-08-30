#!/usr/bin/env bash

source "$CONFIG_DIR/colors.sh"

# Font family used for battery icons (JetBrains Mono Nerd Font is already the bar default)
FONT="JetBrainsMono Nerd Font Mono"

battery_status="$(pmset -g batt)"
percentage="$(printf '%s\n' "$battery_status" | grep -Eo '[0-9]+%' | head -n 1 | tr -d '%')"

if [[ -z "$percentage" ]]; then
  sketchybar --set "$NAME" drawing=off
  exit 0
fi

case "$percentage" in
9[0-9] | 100) icon="" ;;
[6-8][0-9]) icon="" ;;
[3-5][0-9]) icon="" ;;
[1-2][0-9]) icon="" ;;
*) icon="" ;;
esac

color="$TEXT_COLOR"
icon_font_size=22 # larger for narrow unplugged glyphs
if [[ "$battery_status" == *"AC Power"* ]]; then
  icon=""
  icon_font_size=16 # charging bolt is already large enough
elif ((percentage <= 15)); then
  color="$RED_COLOR"
elif ((percentage <= 30)); then
  color="$YELLOW_COLOR"
fi

sketchybar --set "$NAME" \
  drawing=on \
  icon="$icon" \
  icon.font="JetBrainsMono Nerd Font Mono:Regular:$icon_font_size" \
  icon.color="$color" \
  label="${percentage}%" \
  label.color="$color"

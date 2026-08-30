#!/usr/bin/env bash

source "$CONFIG_DIR/colors.sh"

# A Personal Hotspot connection reports the iPhone's name as the Wi-Fi SSID.
# Adjust this pattern if the phone is named differently.
HOTSPOT_PATTERN="${HOTSPOT_PATTERN:-iPhone}"

# Absolute paths: the SketchyBar daemon may not include /usr/sbin in PATH.
ssid="$(/usr/sbin/ipconfig getsummary en0 2>/dev/null | sed -n 's/^ *SSID *: *//p')"

if [[ -z "$ssid" ]]; then
  sketchybar --set "$NAME" \
    icon="󰤭" \
    icon.color="$MUTED_COLOR" \
    icon.font="JetBrainsMono Nerd Font Mono:Regular:20.0" \
    label.drawing=off
elif [[ "$ssid" =~ $HOTSPOT_PATTERN ]]; then
  sketchybar --set "$NAME" \
    icon="󰄌" \
    icon.color="$YELLOW_COLOR" \
    icon.font="JetBrainsMono Nerd Font Mono:Regular:20.0" \
    label.drawing=off
else
  sketchybar --set "$NAME" \
    icon="󰤨" \
    icon.color="$TEXT_COLOR" \
    icon.font="JetBrainsMono Nerd Font Mono:Regular:20.0" \
    label.drawing=off
fi

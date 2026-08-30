#!/usr/bin/env bash

source "$CONFIG_DIR/colors.sh"

# Ivanti takes over the default route through its utun interface while the
# tunnel is up, so that is the default detection. For a more specific marker,
# set IVANTI_ROUTE_MARKER to a routing-table entry that only exists while
# connected (e.g. the tunnel gateway route).
IVANTI_ROUTE_MARKER="${IVANTI_ROUTE_MARKER:-}"

# Absolute paths: the SketchyBar daemon may not include /usr/sbin in PATH.
routes="$(/usr/sbin/netstat -rn -f inet)"

connected=false
if [[ -n "$IVANTI_ROUTE_MARKER" ]]; then
  grep -q "$IVANTI_ROUTE_MARKER" <<<"$routes" && connected=true
else
  grep -q '^default.*utun' <<<"$routes" && connected=true
fi

if $connected; then
  sketchybar --set "$NAME" \
    icon="󰌋" \
    icon.color="$AQUA_COLOR" \
    label="VPN" \
    label.color="$AQUA_COLOR" \
    label.drawing=on
else
  sketchybar --set "$NAME" \
    icon="󰌎" \
    icon.color="$MUTED_COLOR" \
    label.drawing=off
fi

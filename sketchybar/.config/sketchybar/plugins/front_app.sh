#!/usr/bin/env bash

app_name="${INFO:-}"
if [[ -z "$app_name" ]]; then
  app_name="$(aerospace list-windows --focused --format '%{app-name}' 2>/dev/null)"
fi

if [[ -n "$app_name" ]]; then
  sketchybar --set "$NAME" label="$app_name"
fi

#!/usr/bin/env bash
set -euo pipefail
CFG="${HERD_VOICE_CONFIG:-$HOME/.config/herd-voice/config.json}"
mode="${1:-toggle}"
[ -f "$CFG" ] || { echo "config yok: $CFG" >&2; exit 1; }
cur=$(jq -r '.enabled // false' "$CFG")
case "$mode" in
  on)  new=true ;;
  off) new=false ;;
  *)   if [ "$cur" = "true" ]; then new=false; else new=true; fi ;;
esac
tmp=$(mktemp)
jq --argjson e "$new" '.enabled=$e' "$CFG" > "$tmp" && mv "$tmp" "$CFG"
if [ "$new" = "true" ]; then printf '\033]0;🔈 herd-voice on\007'; else printf '\033]0;herd-voice off\007'; fi
echo "herd-voice enabled=$new"

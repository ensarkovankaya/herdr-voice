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
if [ "$new" = "true" ]; then printf '\033]0;🔈 herd-voice on\007'; msg="Ses açıldı"; else printf '\033]0;herd-voice off\007'; msg="Ses kapandı"; fi
# Sesli onay: router'a gönder → aktif cihazda çalar (enabled hook'larda kontrol edilir, off'ta da duyulur)
TOKEN=$(jq -r '.token // ""' "$CFG"); HOST=$(jq -r '.host // "127.0.0.1"' "$CFG"); PORT=$(jq -r '.port // 8973' "$CFG")
if [ -n "$TOKEN" ]; then
  curl -fsS -m 2 -X POST "http://${HOST}:${PORT}/speak" \
    -H "x-voice-token: $TOKEN" -H 'content-type: application/json' \
    -d "{\"text\":\"$msg\"}" >/dev/null 2>&1 || true
fi
echo "herd-voice enabled=$new"

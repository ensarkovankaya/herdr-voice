#!/usr/bin/env bash
set -euo pipefail
CFG="${HERD_VOICE_CONFIG:-$HOME/.herdr-voice/config.json}"
LOG="$HOME/.herdr-voice/logs/herdr-voice.log"
mode="${1:-toggle}"
[ -f "$CFG" ] || { echo "no config: $CFG" >&2; exit 1; }
# Resolve a spoken string: explicit config field wins, else the language pack.
hv_str(){
  local v; v=$(jq -r --arg k "$1" '.[$k] // empty' "$CFG")
  if [ -n "$v" ]; then printf '%s' "$v"
  else case "$(jq -r '.language // "en"' "$CFG")" in tr) printf '%s' "$3" ;; *) printf '%s' "$2" ;; esac; fi
}
cur=$(jq -r '.enabled // false' "$CFG")
case "$mode" in
  on)  new=true ;;
  off) new=false ;;
  *)   if [ "$cur" = "true" ]; then new=false; else new=true; fi ;;
esac
tmp=$(mktemp)
jq --argjson e "$new" '.enabled=$e' "$CFG" > "$tmp" && mv "$tmp" "$CFG"
if [ "$new" = "true" ]; then printf '\033]0;🔈 herd-voice on\007'; msg=$(hv_str voiceOnText 'Voice on.' 'Ses açıldı.'); else printf '\033]0;herd-voice off\007'; msg=$(hv_str voiceOffText 'Voice off.' 'Ses kapandı.'); fi
printf '[%s] [INFO] %s (toggle)\n' "$(date -u +%FT%TZ)" "$([ "$new" = true ] && echo ENABLE || echo DISABLE)" >> "$LOG" 2>/dev/null || true
TOKEN=$(jq -r '.token // ""' "$CFG"); HOST=$(jq -r '.host // "127.0.0.1"' "$CFG"); PORT=$(jq -r '.port // 8973' "$CFG")
if [ -n "$TOKEN" ]; then
  curl -fsS -m 2 -X POST "http://${HOST}:${PORT}/speak" \
    -H "x-voice-token: $TOKEN" -H 'content-type: application/json' \
    -d "{\"text\":\"$msg\"}" >/dev/null 2>&1 || true
fi
echo "herd-voice enabled=$new"

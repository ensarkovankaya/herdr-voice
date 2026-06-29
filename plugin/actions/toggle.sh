#!/usr/bin/env bash
set -euo pipefail
CFG="${HERD_VOICE_CONFIG:-$HOME/.herdr-voice/config.json}"
LOG="$HOME/.herdr-voice/logs/herdr-voice.log"
PANES="$HOME/.herdr-voice/panes"
mode="${1:-toggle}"   # toggle|on|off = global ; pane = focused-pane toggle
[ -f "$CFG" ] || { echo "no config: $CFG" >&2; exit 1; }

# Resolve a spoken string: explicit config field wins, else the language pack.
hv_str(){
  local v; v=$(jq -r --arg k "$1" '.[$k] // empty' "$CFG")
  if [ -n "$v" ]; then printf '%s' "$v"
  else case "$(jq -r '.language // "en"' "$CFG")" in tr) printf '%s' "$3" ;; *) printf '%s' "$2" ;; esac; fi
}
global_enabled(){ jq -r '.enabled // false' "$CFG"; }
set_global(){ local tmp; tmp=$(mktemp); jq --argjson e "$1" '.enabled=$e' "$CFG" > "$tmp" && mv "$tmp" "$CFG"; }
# id of the focused herdr Claude pane (empty if none / herdr unavailable)
focused_pane(){
  local hb; hb="$(command -v herdr || echo "$HOME/.local/bin/herdr")"
  HERDR_SOCKET_PATH="${HERDR_SOCKET_PATH:-$HOME/.config/herdr/herdr.sock}" \
    "$hb" agent list 2>/dev/null | jq -r 'first(.result.agents[]? | select(.focused==true) | .pane_id) // empty'
}

if [ "$mode" = "pane" ]; then
  pane="$(focused_pane || true)"
  if [ -n "$pane" ]; then
    pf="$PANES/$(printf '%s' "$pane" | tr -c 'A-Za-z0-9' '_')"
    mkdir -p "$PANES"
    ov=""; [ -f "$pf" ] && ov="$(cat "$pf")"
    if [ "$ov" = on ]; then eff=true; elif [ "$ov" = off ]; then eff=false; else eff="$(global_enabled)"; fi
    if [ "$eff" = true ]; then printf 'off' > "$pf"; new=false; else printf 'on' > "$pf"; new=true; fi
    scope="pane $pane"
  else
    cur="$(global_enabled)"; new=$([ "$cur" = true ] && echo false || echo true); set_global "$new"
    scope="global (no focused pane)"
  fi
else
  cur="$(global_enabled)"
  case "$mode" in
    on)  new=true ;;
    off) new=false ;;
    *)   if [ "$cur" = true ]; then new=false; else new=true; fi ;;
  esac
  set_global "$new"; scope="global"
fi

if [ "$new" = true ]; then printf '\033]0;🔈 herd-voice on\007'; msg=$(hv_str voiceOnText 'Voice on.' 'Ses açıldı.'); else printf '\033]0;herd-voice off\007'; msg=$(hv_str voiceOffText 'Voice off.' 'Ses kapandı.'); fi
printf '[%s] [INFO] %s (%s)\n' "$(date -u +%FT%TZ)" "$([ "$new" = true ] && echo ENABLE || echo DISABLE)" "$scope" >> "$LOG" 2>/dev/null || true
TOKEN=$(jq -r '.token // ""' "$CFG"); HOST=$(jq -r '.host // "127.0.0.1"' "$CFG"); PORT=$(jq -r '.port // 8973' "$CFG")
if [ -n "$TOKEN" ]; then
  curl -fsS -m 2 -X POST "http://${HOST}:${PORT}/speak" \
    -H "x-voice-token: $TOKEN" -H 'content-type: application/json' \
    -d "{\"text\":\"$msg\"}" >/dev/null 2>&1 || true
fi
echo "herd-voice $scope enabled=$new"

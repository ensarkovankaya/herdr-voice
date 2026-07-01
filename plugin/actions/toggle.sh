#!/usr/bin/env bash
set -euo pipefail
CFG="${HERD_VOICE_CONFIG:-$HOME/.herdr-voice/config.json}"
LOG="$HOME/.herdr-voice/logs/herdr-voice.log"
PANES="$HOME/.herdr-voice/panes"
mode="${1:-toggle}"   # toggle|on|off = global master ; pane = focused-pane opt-in
[ -f "$CFG" ] || { echo "no config: $CFG" >&2; exit 1; }

LOCALES="$(dirname "$CFG")/src/lib/locales"
lang(){ jq -r '.language // "en"' "$CFG"; }
# Resolve a spoken string: explicit config field wins, else the shared locale
# pack for $(lang), else the English pack. $1=config field, $2=locale pack key.
# Reads the same JSON packs the Node daemons do — single source of truth.
hv_str(){
  local v; v=$(jq -r --arg k "$1" '.[$k] // empty' "$CFG")
  [ -n "$v" ] && { printf '%s' "$v"; return; }
  local p; p=$(jq -r --arg k "$2" '.[$k] // empty' "$LOCALES/$(lang).json" 2>/dev/null)
  [ -n "$p" ] && { printf '%s' "$p"; return; }
  jq -r --arg k "$2" '.[$k] // empty' "$LOCALES/en.json" 2>/dev/null
}
global_enabled(){ jq -r '.enabled // false' "$CFG"; }
session_default(){ jq -r '.sessionDefault // "on"' "$CFG"; }
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
    if [ "$ov" = on ]; then cur=true; elif [ "$ov" = off ]; then cur=false
    elif [ "$(session_default)" = on ]; then cur=true; else cur=false; fi
    if [ "$cur" = true ]; then printf 'off' > "$pf"; new=false; else printf 'on' > "$pf"; new=true; fi
    scope="pane $pane"
  else
    cur="$(global_enabled)"; new=$([ "$cur" = true ] && echo false || echo true); set_global "$new"
    scope="global (no focused pane)"
  fi
else
  # Global master switch is owned by the router (single source of truth):
  # it flips config.enabled, logs the toggle, and speaks the confirmation.
  TOKEN=$(jq -r '.token // ""' "$CFG"); HOST=$(jq -r '.host // "127.0.0.1"' "$CFG"); PORT=$(jq -r '.port // 8973' "$CFG")
  case "$mode" in
    on)  want='{"enabled":true}'  ;;
    off) want='{"enabled":false}' ;;
    *)   want='' ;;   # plain toggle: let the router flip current state
  esac
  # POST /toggle flips (no body) and returns {"enabled":bool}. For explicit
  # on/off we still call /toggle only when it would change state.
  cur="$(global_enabled)"
  if [ -n "$want" ]; then
    new=$([ "$mode" = on ] && echo true || echo false)
    [ "$cur" = "$new" ] || curl -fsS -m 2 -X POST "http://${HOST}:${PORT}/toggle" -H "x-voice-token: $TOKEN" >/dev/null 2>&1 || true
  else
    resp="$(curl -fsS -m 2 -X POST "http://${HOST}:${PORT}/toggle" -H "x-voice-token: $TOKEN" 2>/dev/null || true)"
    new="$(printf '%s' "$resp" | jq -r '.enabled // empty' 2>/dev/null)"
    [ -n "$new" ] || new=$([ "$cur" = true ] && echo false || echo true)
  fi
  scope="global"
  # Terminal-title cosmetics stay local (router can't touch this terminal).
  if [ "$new" = true ]; then printf '\033]0;🔈 herdr-voice on\007'; else printf '\033]0;herdr-voice off\007'; fi
  echo "herdr-voice $scope enabled=$new"
  exit 0
fi

if [ "$new" = true ]; then printf '\033]0;🔈 herdr-voice on\007'; msg=$(hv_str voiceOnText voiceOn); else printf '\033]0;herdr-voice off\007'; msg=$(hv_str voiceOffText voiceOff); fi
jq -nc --arg ts "$(date -u +%FT%TZ)" --argjson enabled "$new" --arg source "$scope" \
  '{ts:$ts,level:"INFO",event:"toggle",enabled:$enabled,source:$source}' >> "$LOG" 2>/dev/null || true
# spoken confirmation only when the global master is on (respect master mute)
TOKEN=$(jq -r '.token // ""' "$CFG"); HOST=$(jq -r '.host // "127.0.0.1"' "$CFG"); PORT=$(jq -r '.port // 8973' "$CFG")
if [ "$(global_enabled)" = true ] && [ -n "$TOKEN" ]; then
  curl -fsS -m 2 -X POST "http://${HOST}:${PORT}/speak" \
    -H "x-voice-token: $TOKEN" -H 'content-type: application/json' \
    -d "{\"text\":\"$msg\"}" >/dev/null 2>&1 || true
fi
echo "herdr-voice $scope enabled=$new"

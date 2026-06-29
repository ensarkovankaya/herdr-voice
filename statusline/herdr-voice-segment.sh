#!/usr/bin/env bash
# herdr-voice statusLine segment — effective voice state for THIS pane:
# master(enabled) AND ( per-pane override on/off, else sessionDefault under herdr ).
# Output: "🔈 voice" / "🔇 voice".
CFG="${HERD_VOICE_CONFIG:-$HOME/.herdr-voice/config.json}"
gen=$(jq -r '.enabled // false' "$CFG" 2>/dev/null)
sd=$(jq -r '.sessionDefault // "on"' "$CFG" 2>/dev/null)
eff=false
if [ "$gen" = "true" ]; then
  if [ -n "${HERDR_PANE_ID:-}" ]; then
    pf="$HOME/.herdr-voice/panes/$(printf '%s' "$HERDR_PANE_ID" | tr -c 'A-Za-z0-9' '_')"
    if [ -f "$pf" ]; then v=$(cat "$pf"); [ "$v" = on ] && eff=true || eff=false
    elif [ "$sd" = on ]; then eff=true; fi
  else eff=true; fi
fi
if [ "$eff" = "true" ]; then printf '🔈 voice'; else printf '🔇 voice'; fi

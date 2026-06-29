#!/usr/bin/env bash
# herd-voice statusLine segment — voice on/off for THIS pane (a per-pane override
# beats the global flag). Output: "🔈 voice" / "🔇 voice".
CFG="${HERD_VOICE_CONFIG:-$HOME/.herdr-voice/config.json}"
eff=$(jq -r '.enabled // false' "$CFG" 2>/dev/null)
if [ -n "${HERDR_PANE_ID:-}" ]; then
  pf="$HOME/.herdr-voice/panes/$(printf '%s' "$HERDR_PANE_ID" | tr -c 'A-Za-z0-9' '_')"
  if [ -f "$pf" ]; then v=$(cat "$pf"); [ "$v" = on ] && eff=true; [ "$v" = off ] && eff=false; fi
fi
if [ "$eff" = "true" ]; then printf '🔈 voice'; else printf '🔇 voice'; fi

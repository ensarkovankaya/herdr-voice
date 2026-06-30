#!/usr/bin/env bash
# herdr-voice statusLine segment — global master switch and THIS pane's
# preference, shown separately:
#   G = config.enabled (global master switch).
#   S = this pane's preference: per-pane override (on/off) if set, else
#       sessionDefault; with no pane id there is no per-pane state ⇒ on.
# Effective (the icon) = G AND S.
# Output: "🔈 voice (G:on S:on)" / "🔇 voice (G:on S:off)" / "🔇 voice (G:off S:on)".
CFG="${HERD_VOICE_CONFIG:-$HOME/.herdr-voice/config.json}"
gen=$(jq -r '.enabled // false' "$CFG" 2>/dev/null)
sd=$(jq -r '.sessionDefault // "on"' "$CFG" 2>/dev/null)
[ "$gen" = "true" ] && g=on || g=off
s=on
if [ -n "${HERDR_PANE_ID:-}" ]; then
  pf="$HOME/.herdr-voice/panes/$(printf '%s' "$HERDR_PANE_ID" | tr -c 'A-Za-z0-9' '_')"
  if [ -f "$pf" ]; then v=$(cat "$pf"); [ "$v" = on ] && s=on || s=off
  else [ "$sd" = on ] && s=on || s=off; fi
fi
[ "$g" = on ] && [ "$s" = on ] && icon='🔈' || icon='🔇'
printf '%s voice (G:%s S:%s)' "$icon" "$g" "$s"

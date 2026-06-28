#!/usr/bin/env bash
# herd-voice statusLine segment — voice on/off indicator. Output: "🔈 voice" / "🔇 voice".
hv=$(jq -r '.enabled // false' "${HERD_VOICE_CONFIG:-$HOME/.herdr-voice/config.json}" 2>/dev/null)
if [ "$hv" = "true" ]; then printf '🔈 voice'; else printf '🔇 voice'; fi

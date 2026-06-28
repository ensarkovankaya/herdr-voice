#!/usr/bin/env bash
# herd-voice statusLine segmenti — ses açık/kapalı göstergesi. Çıktı: "🔈 ses" / "🔇 ses".
hv=$(jq -r '.enabled // false' "${HERD_VOICE_CONFIG:-$HOME/.herdr-voice/config.json}" 2>/dev/null)
if [ "$hv" = "true" ]; then printf '🔈 ses'; else printf '🔇 ses'; fi

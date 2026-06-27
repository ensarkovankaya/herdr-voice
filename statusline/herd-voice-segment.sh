#!/usr/bin/env bash
# herd-voice statusLine segmenti — Claude Code status line'ında ses açık/kapalı göstergesi.
#
# İki kullanım:
#   A) Bu script'i doğrudan çağır → çıktı: "🔈 ses" (açık) / "🔇 ses" (kapalı).
#      Kendi statusLine script'inde:  seg=$("$HOME/Projects/herd-voice/statusline/herd-voice-segment.sh")
#   B) Ya da README'deki renkli inline snippet'i kendi script'ine yapıştır.
#
# enabled bilgisi ~/.config/herd-voice/config.json'dan okunur (HERD_VOICE_CONFIG ile override).
hv=$(jq -r '.enabled // false' "${HERD_VOICE_CONFIG:-$HOME/.config/herd-voice/config.json}" 2>/dev/null)
if [ "$hv" = "true" ]; then printf '🔈 ses'; else printf '🔇 ses'; fi

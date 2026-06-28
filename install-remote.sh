#!/usr/bin/env bash
set -euo pipefail
# Kullanım: install-remote.sh <HOST_TS_IP> <TOKEN> [REMOTE_HOST=mac-m4-jftf]
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$(command -v node)"
HOST_IP="${1:?host Tailscale IP gerekli}"; TOKEN="${2:?token gerekli}"; RHOST="${3:-mac-m4-jftf}"
APP="$HOME/.herdr-voice"; CFG="$APP/config.json"
LABEL="dev.ensar.herdr-voice"; PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"; BIN="$HOME/.local/bin/herdr-voice"

mkdir -p "$APP/src" "$APP/logs"; cp -R "$ROOT/src/." "$APP/src/"
# voice korunur (varsa), yoksa Yelda
VOICE=$(jq -r '.voice // "Yelda"' "$CFG" 2>/dev/null || echo Yelda)
jq -n --arg t "$TOKEN" --arg h "$HOST_IP" --arg r "$RHOST" --arg v "$VOICE" \
  '{token:$t, host:$h, port:8973, voice:$v, enabled:true, role:"remote", remoteHost:$r, remoteTtlMs:3600000, forwardTimeoutMs:1500, postTimeoutMs:1500, cue:"Onayın gerekiyor."}' > "$CFG"
mkdir -p "$HOME/.local/bin"; cp "$ROOT/bin/herdr-voice" "$BIN"; chmod +x "$BIN"
sed -e "s#@NODE@#$NODE#g" -e "s#@APP@#$APP#g" -e "s#@DAEMON@#voice-sink.mjs#g" \
  "$ROOT/launchd/dev.ensar.herdr-voice.plist.tmpl" > "$PLIST"
launchctl unload "$PLIST" 2>/dev/null || true; launchctl load -w "$PLIST"
# eski temizlik
rm -rf "$HOME/.config/herd-voice"
echo "remote kuruldu (role=remote, host=$HOST_IP, remoteHost=$RHOST). 'herdr-voice status'."
echo "Kullanım: herdr --remote $RHOST  (ses otomatik bu cihaza gelir; hr GEREKMEZ)"

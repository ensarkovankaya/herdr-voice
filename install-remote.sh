#!/usr/bin/env bash
set -euo pipefail
# Usage: install-remote.sh <HOST_TS_IP> <TOKEN> [REMOTE_HOST]
#   REMOTE_HOST scopes which `herdr --remote <host>` session counts as "present"
#   (empty = any --remote session).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$(command -v node)"
HOST_IP="${1:?host Tailscale IP required}"; TOKEN="${2:?token required}"; RHOST="${3:-}"
APP="$HOME/.herdr-voice"; CFG="$APP/config.json"
LABEL="dev.ensar.herdr-voice"; PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"; BIN="$HOME/.local/bin/herdr-voice"

mkdir -p "$APP/src" "$APP/logs"; cp -R "$ROOT/src/." "$APP/src/"
# preserve an existing voice if present, else default to Samantha
VOICE=$(jq -r '.voice // "Samantha"' "$CFG" 2>/dev/null || echo Samantha)
jq -n --arg t "$TOKEN" --arg h "$HOST_IP" --arg r "$RHOST" --arg v "$VOICE" \
  '{token:$t, host:$h, port:8973, language:"en", voice:$v, enabled:true, role:"remote", remoteHost:$r, remoteTtlMs:3600000, forwardTimeoutMs:1500, postTimeoutMs:1500}' > "$CFG"
mkdir -p "$HOME/.local/bin"; cp "$ROOT/bin/herdr-voice" "$BIN"; chmod +x "$BIN"
sed -e "s#@NODE@#$NODE#g" -e "s#@APP@#$APP#g" -e "s#@DAEMON@#voice-sink.mjs#g" \
  "$ROOT/launchd/dev.ensar.herdr-voice.plist.tmpl" > "$PLIST"
launchctl unload "$PLIST" 2>/dev/null || true; launchctl load -w "$PLIST"
# clean up old v1
rm -rf "$HOME/.config/herd-voice"
echo "remote installed (role=remote, host=$HOST_IP, remoteHost='${RHOST:-any}'). Check with 'herdr-voice status'."
echo "Usage: herdr --remote ${RHOST:-<host>}  (audio is routed here automatically)"

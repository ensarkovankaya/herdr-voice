#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$(command -v node)"
APP="$HOME/.herdr-voice"
CFG="$APP/config.json"
OLD_CFG="$HOME/.config/herd-voice/config.json"
SETTINGS="$HOME/.claude/settings.json"
LABEL="dev.ensar.herdr-voice"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
BIN="$HOME/.local/bin/herdr-voice"

echo "node: $NODE"; herdr --version

# 1) app dizini + src kopyala
mkdir -p "$APP/src" "$APP/logs"
cp -R "$ROOT/src/." "$APP/src/"

# 2) config: migrate (eski varsa) / üret; role=host
if [ ! -f "$CFG" ]; then
  if [ -f "$OLD_CFG" ]; then
    TOKEN=$(jq -r '.token // ""' "$OLD_CFG"); VOICE=$(jq -r '.voice // "Yelda"' "$OLD_CFG"); EN=$(jq -r '.enabled // true' "$OLD_CFG")
  else TOKEN=""; VOICE="Yelda"; EN=true; fi
  [ -n "$TOKEN" ] || TOKEN="$(openssl rand -hex 16)"
  jq -n --arg t "$TOKEN" --arg v "$VOICE" --argjson en "$EN" \
    '{token:$t, host:"127.0.0.1", port:8973, voice:$v, enabled:$en, role:"host", remoteHost:"", remoteTtlMs:3600000, forwardTimeoutMs:1500, postTimeoutMs:1500, cue:"Onayın gerekiyor."}' > "$CFG"
  echo "config yazıldı/migrate edildi: $CFG"
else
  # token eksikse üret + role host garanti
  if [ -z "$(jq -r '.token // ""' "$CFG")" ]; then TOKEN="$(openssl rand -hex 16)"; tmp=$(mktemp); jq --arg t "$TOKEN" '.token=$t' "$CFG" > "$tmp" && mv "$tmp" "$CFG"; fi
  tmp=$(mktemp); jq '.role="host"' "$CFG" > "$tmp" && mv "$tmp" "$CFG"
  echo "config zaten var: $CFG"
fi

# 3) CLI -> ~/.local/bin
mkdir -p "$HOME/.local/bin"; cp "$ROOT/bin/herdr-voice" "$BIN"; chmod +x "$BIN"
echo "CLI: $BIN"

# 4) launchd router
sed -e "s#@NODE@#$NODE#g" -e "s#@APP@#$APP#g" -e "s#@DAEMON@#voice-router.mjs#g" \
  "$ROOT/launchd/dev.ensar.herdr-voice.plist.tmpl" > "$PLIST"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load -w "$PLIST"; sleep 1
curl -fsS "http://127.0.0.1:8973/health" >/dev/null 2>&1 && echo "router up" || echo "router health FAIL"

# 5) Claude hook'ları -> ~/.herdr-voice/src (eski herd-voice girdileri temizlenir, idempotent)
CMD_STOP="\"$NODE\" \"$APP/src/speak-summary.mjs\""
CMD_NOTIFY="\"$NODE\" \"$APP/src/notify-cue.mjs\""
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
tmp=$(mktemp)
jq --arg stop "$CMD_STOP" --arg notify "$CMD_NOTIFY" '
  .hooks = (.hooks // {})
  | .hooks.Stop = ((.hooks.Stop // []) | map(select(((.hooks[]?.command) // "") | test("herd-?voice") | not)))
  | .hooks.Notification = ((.hooks.Notification // []) | map(select(((.hooks[]?.command) // "") | test("herd-?voice") | not)))
  | .hooks.Stop += [{"hooks":[{"type":"command","command":$stop}]}]
  | .hooks.Notification += [{"matcher":"permission_prompt|idle_prompt","hooks":[{"type":"command","command":$notify}]}]
' "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
echo "Claude hook'ları ~/.herdr-voice/src'a bağlandı"

# 6) plugin (manifest üret + link) + toggle yeni config'i kullanır
sed -e "s#@ROOT@#$ROOT#g" "$ROOT/plugin/herdr-plugin.toml.tmpl" > "$ROOT/plugin/herdr-plugin.toml"
herdr plugin link "$ROOT/plugin" >/dev/null 2>&1 || echo "uyarı: herdr plugin link"

# 7) eski v1 temizliği
launchctl unload "$HOME/Library/LaunchAgents/dev.ensar.herd-voice.router.plist" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/dev.ensar.herd-voice.router.plist"
rm -rf "$HOME/.config/herd-voice"
echo "eski v1 (launchd + ~/.config/herd-voice) temizlendi"

echo "Bitti. 'herdr-voice status' ile kontrol et. statusLine + keybind v1'den aynen geçerli."

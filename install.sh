#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$(command -v node)"
CFG_DIR="$HOME/.config/herd-voice"
CFG="$CFG_DIR/config.json"
SETTINGS="$HOME/.claude/settings.json"

echo "node: $NODE"
herdr --version

# 1) config (yoksa oluştur; token üret). host=127.0.0.1 (hook'lar buraya POST eder)
mkdir -p "$CFG_DIR"
if [ ! -f "$CFG" ]; then
  TOKEN="$(openssl rand -hex 16)"
  cat > "$CFG" <<JSON
{
  "token": "$TOKEN",
  "host": "127.0.0.1",
  "port": 8973,
  "voice": "Yelda",
  "enabled": true,
  "remoteTtlMs": 3600000,
  "forwardTimeoutMs": 1500,
  "postTimeoutMs": 1500,
  "cue": "Onayın gerekiyor."
}
JSON
  echo "config yazıldı: $CFG (token üretildi)"
else
  echo "config zaten var: $CFG"
fi

# 2) Claude hook'larını settings.json'a MERGE et (mevcutları koru)
CMD_STOP="\"$NODE\" \"$ROOT/src/speak-summary.mjs\""
CMD_NOTIFY="\"$NODE\" \"$ROOT/src/notify-cue.mjs\""
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
tmp="$(mktemp)"
jq \
  --arg stop "$CMD_STOP" --arg notify "$CMD_NOTIFY" '
  .hooks = (.hooks // {})
  | .hooks.Stop = ((.hooks.Stop // []) | if any(.[]?.hooks[]?; .command == $stop) then . else . + [{"hooks":[{"type":"command","command":$stop}]}] end)
  | .hooks.Notification = ((.hooks.Notification // []) | if any(.[]?.hooks[]?; .command == $notify) then . else . + [{"matcher":"permission_prompt|idle_prompt","hooks":[{"type":"command","command":$notify}]}] end)
  ' "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
echo "settings.json hook'ları eklendi/korundu (Stop + Notification, idempotent)"

# 3) launchd router
PLIST="$HOME/Library/LaunchAgents/dev.ensar.herd-voice.router.plist"
sed -e "s#@NODE@#$NODE#g" -e "s#@ROOT@#$ROOT#g" \
  "$ROOT/launchd/dev.ensar.herd-voice.router.plist.tmpl" > "$PLIST"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
sleep 1
curl -fsS "http://127.0.0.1:8973/health" && echo " <- router up" || echo "router health FAIL"

# 4) herdr plugin: manifest üret + link
sed -e "s#@ROOT@#$ROOT#g" "$ROOT/plugin/herdr-plugin.toml.tmpl" > "$ROOT/plugin/herdr-plugin.toml"
herdr plugin link "$ROOT/plugin" || echo "uyarı: herdr plugin link başarısız (herdr ≥0.7.0?)"

echo "Bitti. herdr keybind eklemek için ~/.config/herdr/config.toml içine:"
echo '  [[keys.command]]'
echo '  key = "prefix+shift+v"'
echo '  type = "plugin_action"'
echo '  command = "ensar.herd-voice.toggle"'
echo '  description = "herd-voice ses aç/kapa"'

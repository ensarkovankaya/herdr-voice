#!/usr/bin/env bash
set -euo pipefail
# Usage:
#   ./install.sh                                      # host (default; runs the router)
#   ./install.sh remote <HOST_TS_IP> <TOKEN> [HOST]   # remote (runs the sink)
#     HOST scopes which `herdr --remote <host>` session counts as "present"
#     (omit = any --remote session).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$(command -v node)"
APP="$HOME/.herdr-voice"
CFG="$APP/config.json"
OLD_CFG="$HOME/.config/herd-voice/config.json"
SETTINGS="$HOME/.claude/settings.json"
LABEL="dev.ensar.herdr-voice"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
BIN="$HOME/.local/bin/herdr-voice"

usage(){ echo "usage: ./install.sh [host] | ./install.sh remote <HOST_TS_IP> <TOKEN> [HOST]" >&2; exit 1; }

MODE="host"
case "${1:-host}" in
  host) ;;
  remote)
    MODE="remote"; shift
    HOST_IP="${1:-}"; TOKEN_ARG="${2:-}"; RHOST="${3:-}"
    [ -n "$HOST_IP" ] && [ -n "$TOKEN_ARG" ] || usage ;;
  *) usage ;;
esac

echo "mode: $MODE | node: $NODE"
[ "$MODE" = host ] && herdr --version

# 1) app dir + copy daemons (shared)
mkdir -p "$APP/src" "$APP/logs"
cp -R "$ROOT/src/." "$APP/src/"

# 2) config + pick the daemon (role-specific)
if [ "$MODE" = host ]; then
  DAEMON="voice-router.mjs"
  if [ ! -f "$CFG" ]; then
    if [ -f "$OLD_CFG" ]; then
      TOKEN=$(jq -r '.token // ""' "$OLD_CFG"); VOICE=$(jq -r '.voice // "Samantha"' "$OLD_CFG"); EN=$(jq -r '.enabled // true' "$OLD_CFG")
    else TOKEN=""; VOICE="Samantha"; EN=true; fi
    [ -n "$TOKEN" ] || TOKEN="$(openssl rand -hex 16)"
    jq -n --arg t "$TOKEN" --arg v "$VOICE" --argjson en "$EN" \
      '{token:$t, host:"127.0.0.1", port:8973, language:"en", voice:$v, enabled:$en, role:"host", remoteHost:"", remoteTtlMs:3600000, forwardTimeoutMs:1500, postTimeoutMs:1500}' > "$CFG"
    echo "config written/migrated: $CFG"
  else
    # patch a missing token + guarantee role=host
    if [ -z "$(jq -r '.token // ""' "$CFG")" ]; then TOKEN="$(openssl rand -hex 16)"; tmp=$(mktemp); jq --arg t "$TOKEN" '.token=$t' "$CFG" > "$tmp" && mv "$tmp" "$CFG"; fi
    tmp=$(mktemp); jq '.role="host"' "$CFG" > "$tmp" && mv "$tmp" "$CFG"
    echo "config already exists: $CFG"
  fi
else
  DAEMON="voice-sink.mjs"
  # preserve an existing voice if present, else default to Samantha
  VOICE=$(jq -r '.voice // "Samantha"' "$CFG" 2>/dev/null || echo Samantha)
  jq -n --arg t "$TOKEN_ARG" --arg h "$HOST_IP" --arg r "$RHOST" --arg v "$VOICE" \
    '{token:$t, host:$h, port:8973, language:"en", voice:$v, enabled:true, role:"remote", remoteHost:$r, remoteTtlMs:3600000, forwardTimeoutMs:1500, postTimeoutMs:1500}' > "$CFG"
  echo "config written: $CFG"
fi

# 3) CLI -> ~/.local/bin (shared)
mkdir -p "$HOME/.local/bin"; cp "$ROOT/bin/herdr-voice" "$BIN"; chmod +x "$BIN"
echo "CLI: $BIN"

# 4) launchd agent (shared template, role-specific daemon)
sed -e "s#@NODE@#$NODE#g" -e "s#@APP@#$APP#g" -e "s#@DAEMON@#$DAEMON#g" \
  "$ROOT/launchd/dev.ensar.herdr-voice.plist.tmpl" > "$PLIST"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load -w "$PLIST"; sleep 1

# 5) host-only: health check + Claude hooks + herdr plugin
if [ "$MODE" = host ]; then
  curl -fsS "http://127.0.0.1:8973/health" >/dev/null 2>&1 && echo "router up" || echo "router health FAIL"

  # Claude hooks -> ~/.herdr-voice/src (idempotent; old herd-voice entries removed first)
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
  echo "Claude hooks wired to ~/.herdr-voice/src"

  # plugin (render manifest + link); toggle reads the new config
  sed -e "s#@ROOT@#$ROOT#g" "$ROOT/plugin/herdr-plugin.toml.tmpl" > "$ROOT/plugin/herdr-plugin.toml"
  herdr plugin link "$ROOT/plugin" >/dev/null 2>&1 || echo "warning: herdr plugin link failed"

  # drop the old v1 router agent
  launchctl unload "$HOME/Library/LaunchAgents/dev.ensar.herd-voice.router.plist" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/dev.ensar.herd-voice.router.plist"
fi

# 6) clean up old v1 config (shared)
rm -rf "$HOME/.config/herd-voice"
echo "cleaned up old v1"

# 7) done
if [ "$MODE" = host ]; then
  echo "Done. Check with 'herdr-voice status'. The statusLine snippet + keybind from v1 still apply."
else
  echo "Done (role=remote, host=$HOST_IP, remoteHost='${RHOST:-any}'). Check with 'herdr-voice status'."
  echo "Usage: herdr --remote ${RHOST:-<host>}  (audio is routed here automatically)"
fi

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
SETTINGS="$HOME/.claude/settings.json"
LABEL="dev.herdr-voice"
# shellcheck source=bin/lib/service.sh
. "$ROOT/bin/lib/service.sh"
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
mkdir -p "$APP/bin/lib"
cp "$ROOT/bin/lib/service.sh" "$APP/bin/lib/service.sh"
cp "$ROOT/package.json" "$APP/package.json"   # version source for `herdr-voice version`

# 2) config + pick the daemon (role-specific)
if [ "$MODE" = host ]; then
  DAEMON="voice-router.mjs"
  if [ ! -f "$CFG" ]; then
    OS="$(svc_os)"
    DEF_PROVIDER=$([ "$OS" = darwin ] && echo say || echo piper)
    PROVIDER="$DEF_PROVIDER"
    if [ -t 0 ]; then
      printf "TTS provider [say/piper/gemini] (%s): " "$DEF_PROVIDER"; read -r ans || ans=""
      case "$ans" in say|piper|gemini) PROVIDER="$ans" ;; esac
    fi
    case "$PROVIDER" in
      say)    TTS_JSON='{"provider":"say","say":{"voice":"Samantha"}}' ;;
      piper)  TTS_JSON='{"provider":"piper","piper":{"cmd":"python3 -m piper","voice":"en_US-lessac-medium","dataDir":"'"$APP"'/voices"}}' ;;
      gemini)
        KEYENV="GEMINI_API_KEY"; GVOICE="Kore"
        if [ -t 0 ]; then
          printf "Gemini API key env var (GEMINI_API_KEY): "; read -r k || k=""; [ -n "$k" ] && KEYENV="$k"
          printf "Gemini voice (Kore): "; read -r v || v=""; [ -n "$v" ] && GVOICE="$v"
        fi
        TTS_JSON='{"provider":"gemini","gemini":{"model":"gemini-2.5-flash-preview-tts","voice":"'"$GVOICE"'","apiKeyEnv":"'"$KEYENV"'","languageCode":""}}' ;;
    esac
    jq -n --arg t "$(openssl rand -hex 16)" --argjson tts "$TTS_JSON" \
      '{token:$t, host:"127.0.0.1", port:8973, language:"en", enabled:true, role:"host", remoteHost:"", remoteTtlMs:3600000, forwardTimeoutMs:1500, postTimeoutMs:1500, tts:$tts, audio:{player:"auto"}, summarize:{mode:"heuristic", maxLen:240}}' > "$CFG"
    echo "config written: $CFG"
  else
    # patch a missing token + guarantee role=host
    if [ -z "$(jq -r '.token // ""' "$CFG")" ]; then TOKEN="$(openssl rand -hex 16)"; tmp=$(mktemp); jq --arg t "$TOKEN" '.token=$t' "$CFG" > "$tmp" && mv "$tmp" "$CFG"; fi
    tmp=$(mktemp); jq '.role="host"' "$CFG" > "$tmp" && mv "$tmp" "$CFG"
    echo "config already exists: $CFG"
  fi
else
  DAEMON="voice-sink.mjs"
  # preserve an existing tts/language on reinstall, else default to say/en
  LANG_=$(jq -r '.language // "en"' "$CFG" 2>/dev/null || echo en)
  PREV_TTS=$(jq -c '.tts // {"provider":"say","say":{"voice":"Samantha"}}' "$CFG" 2>/dev/null || echo '{"provider":"say","say":{"voice":"Samantha"}}')
  jq -n --arg t "$TOKEN_ARG" --arg h "$HOST_IP" --arg r "$RHOST" --arg l "$LANG_" --argjson tts "$PREV_TTS" \
    '{token:$t, host:$h, port:8973, language:$l, enabled:true, role:"remote", remoteHost:$r, remoteTtlMs:3600000, forwardTimeoutMs:1500, postTimeoutMs:1500, tts:$tts, audio:{player:"auto"}, summarize:{mode:"heuristic", maxLen:240}}' > "$CFG"
  echo "config written: $CFG"
fi

# 3) CLI -> ~/.local/bin (shared)
mkdir -p "$HOME/.local/bin"; cp "$ROOT/bin/herdr-voice" "$BIN"; chmod +x "$BIN"
echo "CLI: $BIN"

# 4) install + start daemon (OS-dispatched: launchd on macOS, systemd --user on Linux)
# Inject env into the unit/plist: svc_install always adds PATH; for gemini, also
# pass the configured key env var if it is set in the installer's environment.
EXTRA=""
if [ "${PROVIDER:-}" = gemini ]; then
  KV="$(printenv "${KEYENV:-GEMINI_API_KEY}" 2>/dev/null || true)"
  [ -n "$KV" ] && EXTRA="${KEYENV:-GEMINI_API_KEY}=$KV"
fi
export SVC_EXTRA_ENV="$EXTRA"
svc_install "$DAEMON"; sleep 1

# 5) host-only: health check + Claude hooks + herdr plugin
if [ "$MODE" = host ]; then
  curl -fsS "http://127.0.0.1:8973/health" >/dev/null 2>&1 && echo "router up" || echo "router health FAIL"

  # Claude hooks -> ~/.herdr-voice/src (idempotent; existing herdr-voice entries removed first)
  CMD_STOP="\"$NODE\" \"$APP/src/speak-summary.mjs\""
  CMD_NOTIFY="\"$NODE\" \"$APP/src/notify-cue.mjs\""
  [ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
  tmp=$(mktemp)
  jq --arg stop "$CMD_STOP" --arg notify "$CMD_NOTIFY" '
    .hooks = (.hooks // {})
    | .hooks.Stop = ((.hooks.Stop // []) | map(select(((.hooks[]?.command) // "") | test("herdr?-voice") | not)))
    | .hooks.Notification = ((.hooks.Notification // []) | map(select(((.hooks[]?.command) // "") | test("herdr?-voice") | not)))
    | .hooks.Stop += [{"hooks":[{"type":"command","command":$stop}]}]
    | .hooks.Notification += [{"matcher":"permission_prompt|idle_prompt","hooks":[{"type":"command","command":$notify}]}]
  ' "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
  echo "Claude hooks wired to ~/.herdr-voice/src"

  # plugin (link); toggle reads the new config
  herdr plugin link "$ROOT/plugin" >/dev/null 2>&1 || echo "warning: herdr plugin link failed"
fi

# 6) done
if [ "$MODE" = host ]; then
  echo "Done. Check with 'herdr-voice status'. Add the statusLine snippet + keybind from the README if you want them."
else
  echo "Done (role=remote, host=$HOST_IP, remoteHost='${RHOST:-any}'). Check with 'herdr-voice status'."
  echo "Usage: herdr --remote ${RHOST:-<host>}  (audio is routed here automatically)"
fi

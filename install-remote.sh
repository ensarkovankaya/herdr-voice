#!/usr/bin/env bash
set -euo pipefail
# Kullanım: install-remote.sh <HOST_TS_IP> <TOKEN>  (TOKEN host config'inden kopyalanır)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_IP="${1:?host Tailscale IP gerekli (örn 100.109.4.84)}"
TOKEN="${2:?token gerekli (host ~/.config/herd-voice/config.json .token)}"
CFG_DIR="$HOME/.config/herd-voice"
mkdir -p "$CFG_DIR"
cat > "$CFG_DIR/config.json" <<JSON
{
  "token": "$TOKEN",
  "host": "$HOST_IP",
  "port": 8973,
  "voice": "Yelda",
  "enabled": true,
  "forwardTimeoutMs": 1500,
  "postTimeoutMs": 1500
}
JSON
echo "remote config yazıldı. hr için:  $ROOT/bin/hr  (veya PATH'e ekle)"

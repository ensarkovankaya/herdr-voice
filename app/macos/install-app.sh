#!/usr/bin/env bash
# Build HerdrVoiceBar.app and (re)install it to ~/Applications, then relaunch.
# Login at startup is managed inside the app (Ayarlar › Girişte Başlat).
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="HerdrVoiceBar"
TARGET="$HOME/Applications/$APP_NAME.app"

./build-app.sh

pkill -x "$APP_NAME" 2>/dev/null || true
rm -rf "$TARGET"
mkdir -p "$HOME/Applications"
cp -R "dist/$APP_NAME.app" "$TARGET"
open "$TARGET"
echo "Installed $TARGET"

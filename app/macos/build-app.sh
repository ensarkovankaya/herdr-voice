#!/usr/bin/env bash
# Assemble HerdrVoiceBar.app from the SwiftPM release build (no Xcode needed).
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="HerdrVoiceBar"
BUNDLE_ID="dev.herdr-voice.bar"
DIST="dist"
APP="$DIST/$APP_NAME.app"

swift build -c release
BIN="$(swift build -c release --show-bin-path)/$APP_NAME"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/$APP_NAME"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>$APP_NAME</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

# Sign the bundle. Default is ad-hoc (`-`); set HERDR_SIGN_ID to a code-signing
# identity name (e.g. a self-signed "herdr-voice-selfsign" or a Developer ID) for
# a STABLE signature so notification permission survives rebuilds. A stable
# identity requires an interactive keychain session (run this in your terminal
# and approve any "codesign wants to use key" prompt with "Always Allow").
SIGN_ID="${HERDR_SIGN_ID:--}"
codesign --force --sign "$SIGN_ID" "$APP" >/dev/null 2>&1 || echo "warning: codesign failed (sign id: $SIGN_ID) — bundle may be unsigned" >&2

echo "Built $APP"

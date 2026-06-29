# Sourced by install.sh and bin/herdr-voice. Expects: APP, NODE, LABEL, ROOT.
# Dispatches daemon lifecycle to launchd (macOS) or systemd --user (Linux).
svc_os() { case "$(uname -s)" in Darwin) echo darwin ;; Linux) echo linux ;; *) echo unsupported ;; esac; }

_plist() { echo "$HOME/Library/LaunchAgents/$LABEL.plist"; }
_unit()  { echo "$HOME/.config/systemd/user/$LABEL.service"; }

# $1 = daemon filename (voice-router.mjs | voice-sink.mjs)
svc_install() {
  local daemon="$1"
  case "$(svc_os)" in
    darwin)
      sed -e "s#@NODE@#$NODE#g" -e "s#@APP@#$APP#g" -e "s#@DAEMON@#$daemon#g" \
        "$ROOT/launchd/dev.herdr-voice.plist.tmpl" > "$(_plist)"
      launchctl unload "$(_plist)" 2>/dev/null || true
      launchctl load -w "$(_plist)" ;;
    linux)
      mkdir -p "$(dirname "$(_unit)")"
      sed -e "s#@NODE@#$NODE#g" -e "s#@APP@#$APP#g" -e "s#@DAEMON@#$daemon#g" \
        "$ROOT/service/dev.herdr-voice.service.tmpl" > "$(_unit)"
      systemctl --user daemon-reload
      systemctl --user enable --now "$LABEL.service" ;;
    *) echo "unsupported OS for service install" >&2; return 1 ;;
  esac
}

svc_start()   { case "$(svc_os)" in darwin) launchctl load -w "$(_plist)" ;; linux) systemctl --user start "$LABEL.service" ;; esac; }
svc_stop()    { case "$(svc_os)" in darwin) launchctl unload -w "$(_plist)" ;; linux) systemctl --user stop "$LABEL.service" ;; esac; }
svc_restart() { case "$(svc_os)" in darwin) launchctl kickstart -k "gui/$(id -u)/$LABEL" ;; linux) systemctl --user restart "$LABEL.service" ;; esac; }

svc_status() {
  case "$(svc_os)" in
    darwin) launchctl list "$LABEL" >/dev/null 2>&1 && echo running || echo stopped ;;
    linux)  systemctl --user is-active --quiet "$LABEL.service" && echo running || echo stopped ;;
  esac
}

svc_uninstall() {
  case "$(svc_os)" in
    darwin) launchctl unload -w "$(_plist)" 2>/dev/null || true; rm -f "$(_plist)" ;;
    linux)  systemctl --user disable --now "$LABEL.service" 2>/dev/null || true; rm -f "$(_unit)"; systemctl --user daemon-reload 2>/dev/null || true ;;
  esac
}

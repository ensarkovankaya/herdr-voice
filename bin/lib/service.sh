# Sourced by install.sh and bin/herdr-voice. Expects: APP, NODE, LABEL, ROOT.
# Dispatches daemon lifecycle to launchd (macOS) or systemd --user (Linux).
svc_os() { case "$(uname -s)" in Darwin) echo darwin ;; Linux) echo linux ;; *) echo unsupported ;; esac; }

_plist() { echo "$HOME/Library/LaunchAgents/$LABEL.plist"; }
_unit()  { echo "$HOME/.config/systemd/user/$LABEL.service"; }

# Emit the env KEY=VALUE pairs to inject: always PATH first, then each
# non-empty line of $SVC_EXTRA_ENV (newline-separated KEY=VALUE). Values are
# never sed-substituted, so /, :, & in PATH/keys stay literal.
_svc_env_pairs() {
  printf '%s\n' "PATH=$PATH"
  if [ -n "${SVC_EXTRA_ENV:-}" ]; then
    printf '%s\n' "$SVC_EXTRA_ENV" | while IFS= read -r line; do
      [ -n "$line" ] && printf '%s\n' "$line"
    done
  fi
}

# Replace a single @placeholder@ in a file with literal multi-line content read
# from stdin. The value is passed via env (not -v) so awk applies no backslash
# escape processing — it stays byte-for-byte literal (/, :, & are all safe).
_splice_placeholder() {
  local file="$1" ph="$2"; SVC_BLOCK="$(cat)"
  SVC_BLOCK="$SVC_BLOCK" awk -v ph="$ph" '
    BEGIN { block = ENVIRON["SVC_BLOCK"] }
    index($0, ph) {
      pre = substr($0, 1, index($0, ph) - 1)
      post = substr($0, index($0, ph) + length(ph))
      printf "%s%s%s\n", pre, block, post
      next
    }
    { print }
  ' "$file"
}

# systemd: one "Environment=KEY=VALUE" line per env pair.
_svc_systemd_env_lines() {
  _svc_env_pairs | while IFS= read -r kv; do printf 'Environment=%s\n' "$kv"; done
}

# launchd: "<key>KEY</key><string>VALUE</string>" per env pair (KEY before first =).
_svc_launchd_env_dict() {
  _svc_env_pairs | while IFS= read -r kv; do
    local k="${kv%%=*}" v="${kv#*=}"
    printf '<key>%s</key><string>%s</string>' "$k" "$v"
  done
}

# $1 = daemon filename (voice-router.mjs | voice-sink.mjs)
svc_install() {
  local daemon="$1" rendered
  case "$(svc_os)" in
    darwin)
      # render static placeholders, then splice the env dict (value stays literal)
      sed -e "s#@NODE@#$NODE#g" -e "s#@APP@#$APP#g" -e "s#@DAEMON@#$daemon#g" \
        "$ROOT/launchd/dev.herdr-voice.plist.tmpl" > "$(_plist).tmp"
      _splice_placeholder "$(_plist).tmp" '@ENVDICT@' <<<"$(_svc_launchd_env_dict)" > "$(_plist)"
      rm -f "$(_plist).tmp"
      launchctl unload "$(_plist)" 2>/dev/null || true
      launchctl load -w "$(_plist)" ;;
    linux)
      mkdir -p "$(dirname "$(_unit)")"
      sed -e "s#@NODE@#$NODE#g" -e "s#@APP@#$APP#g" -e "s#@DAEMON@#$daemon#g" \
        "$ROOT/service/dev.herdr-voice.service.tmpl" > "$(_unit).tmp"
      _splice_placeholder "$(_unit).tmp" '@ENVLINES@' <<<"$(_svc_systemd_env_lines)" > "$(_unit)"
      rm -f "$(_unit).tmp"
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

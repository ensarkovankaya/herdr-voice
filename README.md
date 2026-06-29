# 🔊 herd-voice

> Spoken summaries for **Claude Code** — heard on whatever device you're actually sitting at.

herd-voice says a short sentence out loud whenever Claude Code **finishes a task** or **needs your approval**. Working locally? It plays on your Mac. Connected from another machine with [`herdr --remote`](https://herdr.dev)? It follows you there. The talking is done by the built-in macOS `say` command — **no cloud, no API keys, no npm dependencies.**

It's the inverse of dictation tools like VoiceInk (which do **speech → text**); herd-voice does **text → speech** for Claude's output only.

______________________________________________________________________

## ✨ Highlights

- 🔔 **Speaks on the moments that matter** — task done, or approval/input needed.
- 📍 **Follows you across devices** — presence-aware routing over [Tailscale](https://tailscale.com); audio plays where you are.
- 🗣️ **Any voice, any language** — uses any installed macOS voice; ships with `en` and `tr` string packs, fully overridable from config.
- 🧹 **Speech-friendly summaries** — markdown, code blocks, and emoji are stripped, so you hear the message, not the syntax.
- 🔌 **herdr plugin** — toggle voice on/off with a keybind, see status in your prompt.
- 🪶 **Tiny footprint** — daemons are Node.js stdlib only (zero npm deps); CLI is Bash.
- 🛠️ **Real service** — launchd startup, rotating logs, one-command install & uninstall.

______________________________________________________________________

## How it works

```
Claude Code (host Mac) finishes a task / needs approval
        │  Stop hook                      Notification hook
        ▼                                 (permission_prompt | idle_prompt)
  speak-summary.mjs                  notify-cue.mjs          (Node, Claude hooks)
        │  last assistant message → summarize → POST /speak {text}
        ▼
  voice-router   (launchd daemon @ host, 0.0.0.0:8973)
        │
        ├─ active remote registered & not expired?
        │        └─ NO  → speak locally:  say -v <voice>
        │
        └─ YES → forward over Tailscale → voice-sink @ remote → say -v <voice>
                        └─ on failure → drop registration + speak locally (fallback)
```

**"Active device"** = the machine whose herdr client you're sitting in front of. When you run `herdr --remote <host>`, that device registers itself with the host router (`/register`) and deregisters on exit (`/deregister`). With no live registration (or an expired one), the router speaks on the host. This relies only on the registration + TTL + a forward-timeout fallback — **not** on herdr's internal API.

### Components

| File                                                   | Role                                                                                                                                                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/voice-router.mjs`                                 | **Host daemon.** Accepts `/speak`, routes to the active device; tracks the remote sink via `/register`·`/deregister`; falls back to local `say` if the remote is unreachable. Always-on via launchd.      |
| `src/voice-sink.mjs`                                   | **Remote daemon.** `/speak {text}` → `say -v <voice>`. Installed as a launchd agent by `./install.sh remote`.                                                                                             |
| `src/speak-summary.mjs`                                | **Claude Stop hook.** Waits for the transcript to settle (so it never speaks the previous turn), reads the last assistant message → `summarize` → POSTs to the router. Never throws (won't block Claude). |
| `src/notify-cue.mjs`                                   | **Claude Notification hook.** Speaks a short fixed cue when approval/input is needed.                                                                                                                     |
| `src/lib/summarize.mjs`                                | Strips markdown/code/emoji, reduces to the first sentence(s) (≤240 chars); falls back to a fixed phrase when empty.                                                                                       |
| `src/lib/strings.mjs`                                  | Built-in spoken-string packs (`en`, `tr`), selected by `config.language`.                                                                                                                                 |
| `src/lib/{config,http,speak,logger,presence,pane}.mjs` | config loader · tiny HTTP helpers · serial `say` queue · rotating logger · presence watcher · per-pane override resolver.                                                                                 |
| `bin/herdr-voice`                                      | **CLI:** `start/stop/restart/status/logs/enable/disable/uninstall` — manages this machine's daemon.                                                                                                       |
| `plugin/`                                              | **herdr plugin** (`ensar.herd-voice`): toggle (global) / toggle-pane / enable / disable actions.                                                                                                          |
| `launchd/dev.herdr-voice.plist.tmpl`                   | launchd template for both the router (host) and the sink (remote).                                                                                                                                        |

Daemons + Claude hooks are **Node.js** (stdlib only); the CLI + plugin actions are **Bash**.

______________________________________________________________________

## Requirements

- **macOS** (Apple Silicon or Intel) with a working `say` voice — list them with `say -v '?'`.
- **[herdr](https://herdr.dev) ≥ 0.7.0** (plugin API) — only needed for the plugin/keybind and remote routing.
- `node`, `jq`, `curl`, and (for the remote scenario) `tailscale`.
- A **Tailscale** mesh between your devices, if you want audio to follow you to a remote machine.

______________________________________________________________________

## Quick start

### Host (where Claude Code runs)

```sh
git clone https://github.com/ensarkovankaya/herdr-voice.git
cd herdr-voice
./install.sh
```

This will:

1. Create `~/.herdr-voice/config.json` and **generate a token**. Role: `host`.
2. Add the Claude **Stop + Notification hooks** to `~/.claude/settings.json` (idempotent; existing hooks preserved).
3. Load the launchd **voice-router** (`~/Library/LaunchAgents/dev.herdr-voice.plist`) and health-check it.
4. Link the herdr plugin (`herdr plugin link plugin/`).

That's it — finish a task and you'll hear it. To toggle with keybinds, add these to `~/.config/herdr/config.toml`, then run `herdr server reload-config`:

```toml
# global on/off (whole machine)
[[keys.command]]
key = "prefix+shift+v"
type = "plugin_action"
command = "ensar.herd-voice.toggle"
description = "herd-voice: toggle voice (global)"

# this pane only (overrides global for the focused Claude pane)
[[keys.command]]
key = "prefix+shift+p"
type = "plugin_action"
command = "ensar.herd-voice.toggle-pane"
description = "herd-voice: toggle voice (this pane)"
```

**Per-pane vs global:** `prefix+shift+v` is the global master switch; `prefix+shift+p` toggles just the focused pane. Set `sessionDefault: "off"` (see [Configuration](#configuration)) to start every session silent and opt the ones you want in with `prefix+shift+p`; leave it `on` to talk everywhere and silence the noisy ones. See [Keybinds](#keybinds) for exactly how they combine.

### Remote (a second machine — optional)

Run this on the **away** machine so audio follows you there when you `herdr --remote` into the host:

```sh
git clone https://github.com/ensarkovankaya/herdr-voice.git
cd herdr-voice
./install.sh remote <HOST_TAILSCALE_IP> <TOKEN> [HOST]
```

- `<TOKEN>` — copy it from the host: `jq -r .token ~/.herdr-voice/config.json`. Must match on both sides.
- `[HOST]` — optional; scopes which `herdr --remote <host>` session counts as "you're here" (omit to match any `--remote` session).

```sh
./install.sh remote 100.x.y.z $(: paste token) my-host-magicdns
```

Then just connect — audio is routed to this device automatically while the session is live:

```sh
herdr --remote my-host-magicdns
```

______________________________________________________________________

## Configuration

`~/.herdr-voice/config.json` (override the path with `HERD_VOICE_CONFIG`):

| Field                          | Default       | Description                                                                                                          |
| ------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| `token`                        | *(generated)* | Shared secret sent as the `X-Voice-Token` header. Same on host and remote.                                           |
| `host`                         | `127.0.0.1`   | The **router address** this machine talks to. `127.0.0.1` on the host; the host's Tailscale IP on a remote.          |
| `port`                         | `8973`        | Router/sink port.                                                                                                    |
| `language`                     | `en`          | Built-in spoken-string pack: `en` or `tr`. Drives the defaults for `cue`, `fallback`, `voiceOnText`, `voiceOffText`. |
| `voice`                        | `Samantha`    | macOS `say -v` voice. List with `say -v '?'`.                                                                        |
| `enabled`                      | `true`        | Global master switch — hooks speak only when `true` (the router/sink always run).                                    |
| `sessionDefault`               | `on`          | Under herdr, the default for a pane with no explicit override: `on` (talk) or `off` (opt-in per pane via keybind).   |
| `role`                         | `host`        | `host` (runs the router) or `remote` (runs the sink + presence watcher).                                             |
| `remoteHost`                   | `""`          | On a remote, scopes which `herdr --remote <host>` session counts as present (empty = any).                           |
| `remoteTtlMs`                  | `3600000`     | Safety expiry for a remote registration.                                                                             |
| `forwardTimeoutMs`             | `1500`        | Router→sink forward timeout.                                                                                         |
| `postTimeoutMs`                | `1500`        | Hook→router POST timeout.                                                                                            |
| `cue`                          | *(from pack)* | Spoken when approval/input is needed.                                                                                |
| `fallback`                     | *(from pack)* | Spoken when the summary is empty.                                                                                    |
| `voiceOnText` / `voiceOffText` | *(from pack)* | Spoken when toggling voice on/off.                                                                                   |

Any spoken string can be overridden individually — set the field in `config.json` and it wins over the language pack.

### Example: Turkish output

```json
{
  "language": "tr",
  "voice": "Yelda"
}
```

`language: "tr"` switches every spoken default to Turkish (`cue` → "Onayın gerekiyor.", `fallback` → "Tamamlandı.", etc.); `voice: "Yelda"` picks the matching macOS voice. Restart the daemon after changing `voice` (`herdr-voice restart`).

______________________________________________________________________

## CLI: `herdr-voice`

Manages this machine's launchd daemon (router on a host, sink + watcher on a remote):

```sh
herdr-voice start       # start the daemon (launchd)
herdr-voice stop        # stop it
herdr-voice restart     # restart it
herdr-voice status      # running? + role + enabled + voice + recent logs
herdr-voice logs        # tail -f ~/.herdr-voice/logs/herdr-voice.log
herdr-voice enable      # turn voice on  (config.enabled=true)  + spoken confirmation
herdr-voice disable     # turn voice off (config.enabled=false) + spoken confirmation
herdr-voice uninstall   # remove everything (see below)
```

```text
$ herdr-voice status
herdr-voice: running | role=host | enabled=true | voice=Samantha
```

______________________________________________________________________

## Keybinds

herd-voice exposes herdr **plugin actions**; bind the ones you want in `~/.config/herdr/config.toml` (snippet in [Host setup](#host-where-claude-code-runs)), then run `herdr server reload-config`. `prefix` is herdr's own leader key (whatever you've set it to in herdr).

| Shortcut         | herdr action                           | What it does                                                                      |
| ---------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| `prefix+shift+v` | `ensar.herd-voice.toggle`              | **Global master** on/off — silences or re-enables voice for the whole machine.    |
| `prefix+shift+p` | `ensar.herd-voice.toggle-pane`         | **This pane only** — toggles voice for the focused Claude pane (opt-in override). |
| *(unbound)*      | `ensar.herd-voice.enable` / `.disable` | Force the global master on / off (same as `herdr-voice enable` / `disable`).      |

The shortcut keys above are just suggestions — you pick them in your herdr config; the **action ids** are what matter.

**How they combine:** voice plays only when the **master is on** *and* the pane is on. A pane is "on" when its explicit override (set by `prefix+shift+p`) says so, or — with no override — when `sessionDefault` is `on`. So `prefix+shift+v` is the big switch and `prefix+shift+p` opts individual sessions in or out.

______________________________________________________________________

## Claude status line indicator

Show the voice state in your Claude Code prompt (`🔈 voice` on / `🔇 voice` off) by adding a segment to your statusLine script.

**A) Call this repo's segment script:**

```sh
seg=$("$HOME/Projects/herd-voice/statusline/herd-voice-segment.sh")   # "🔈 voice" / "🔇 voice"
```

**B) Or inline a colored snippet** into your own statusLine script (the one `statusLine.command` in `~/.claude/settings.json` points to):

```bash
hv=$(jq -r '.enabled // false' "$HOME/.herdr-voice/config.json" 2>/dev/null)
if [ "$hv" = "true" ]; then printf '  \033[2;32m🔈 voice\033[0m'
else                        printf '  \033[2;90m🔇 voice\033[0m'; fi
```

> The statusLine script belongs to Claude Code (outside this repo); it re-runs on every refresh, so no reload is needed.

______________________________________________________________________

## Logs

Everything goes to `~/.herdr-voice/logs/herdr-voice.log` (size-rotated, ~1 MB × 5), plus launchd's own `launchd.out.log` / `launchd.err.log`.

```sh
herdr-voice logs                          # tail -f the app log
tail -f ~/.herdr-voice/logs/launchd.*.log # raw launchd stdout/stderr
```

______________________________________________________________________

## Troubleshooting

```sh
# Is the router/sink up?
curl -fsS http://127.0.0.1:8973/health        # {"ok":true}
herdr-voice status

# Is voice enabled?
jq .enabled ~/.herdr-voice/config.json

# Restart after a config/token change
herdr-voice restart                           # (host: also works via launchctl kickstart)

# Send a manual test phrase
TOKEN=$(jq -r .token ~/.herdr-voice/config.json)
curl -X POST http://127.0.0.1:8973/speak \
  -H "X-Voice-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"Hello from herd-voice"}'

# Watch remote presence (register/deregister) on the host
tail -f ~/.herdr-voice/logs/herdr-voice.log | grep -i register

# Plugin action history (did toggle run?)
herdr plugin log list --plugin ensar.herd-voice
```

**No sound?** Walk the checklist: `enabled=true` → router `/health` ok → `say -v <voice> hello` works → volume/output device → (remote) the `herdr --remote` session shows a `register` line in the host log.

______________________________________________________________________

## Uninstall

```sh
herdr-voice uninstall        # asks to confirm
herdr-voice uninstall --yes  # no prompt
```

Removes: the launchd daemon + plist, the CLI (`~/.local/bin/herdr-voice`), and `~/.herdr-voice/` (config + token). **On a host it also** strips the herd-voice Claude hooks from `settings.json` (others preserved) and uninstalls the herdr plugin. **By hand:** the statusLine snippet and the herdr keybind (`prefix+shift+v`).

______________________________________________________________________

## Development

```sh
node --test    # run the test suite (Node stdlib test runner, zero deps)
```

## Roadmap

- A pluggable TTS backend behind `lib/speak.mjs` (e.g. [Piper](https://github.com/OHF-Voice/piper1-gpl) or other local neural voices) for higher-quality, cross-platform output.
- Thin clients (phone/tablet over SSH) aren't supported yet — there's no local process to play audio on them.

## License

[MIT](LICENSE) © Ensar Kovankaya

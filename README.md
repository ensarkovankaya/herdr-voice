# 🔊 herdr-voice

> Spoken summaries for **Claude Code** — heard on whatever device you're actually sitting at.

herdr-voice says a short sentence out loud whenever Claude Code **finishes a task** or **needs your approval**. Working locally? It plays on your Mac. Connected from another machine with [`herdr --remote`](https://herdr.dev)? It follows you there.

It's the inverse of dictation tools like VoiceInk (which do **speech → text**); herdr-voice does **text → speech** for Claude's output only.

______________________________________________________________________

## ✨ Highlights

- 🔔 **Speaks on the moments that matter** — task done, or approval/input needed.
- 📍 **Follows you across devices** — presence-aware routing over [Tailscale](https://tailscale.com); audio plays where you are.
- 🗣️ **Pluggable TTS** — `say` (macOS built-in), `piper` (local neural, macOS + Linux), or `gemini` (cloud). Any voice, any language.
- 🧹 **Speech-friendly summaries** — markdown, code blocks, and emoji are stripped, so you hear the message, not the syntax. Summarizer is also pluggable: heuristic (default), LLM via HTTP, or any CLI command.
- 🔌 **herdr plugin** — toggle voice on/off with a keybind, see status in your prompt.
- 🪶 **Tiny footprint** — daemons are Node.js stdlib only (zero npm deps); CLI is Bash.
- 🛠️ **Real service** — launchd (macOS) / systemd (Linux) startup, rotating logs, one-command install & uninstall.

______________________________________________________________________

## How it works

```
Claude Code (host) finishes a task / needs approval
        │  Stop hook                      Notification hook
        ▼                                 (permission_prompt | idle_prompt)
  speak-summary.mjs                  notify-cue.mjs          (Node, Claude hooks)
        │  last assistant message → summarize → POST /speak {text}
        ▼
  voice-router   (service daemon @ host, 0.0.0.0:8973)
        │
        ├─ active remote registered & not expired?
        │        └─ NO  → speak locally via TTS provider
        │
        └─ YES → forward over Tailscale → voice-sink @ remote → TTS provider
                        └─ on failure → drop registration + speak locally (fallback)
```

**"Active device"** = the machine whose herdr client you're sitting in front of. When you run `herdr --remote <host>`, that device registers itself with the host router (`/register`) and deregisters on exit (`/deregister`). With no live registration (or an expired one), the router speaks on the host. This relies only on the registration + TTL + a forward-timeout fallback — **not** on herdr's internal API.

### Components

| File                                             | Role                                                                                                                                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/voice-router.mjs`                           | **Host daemon.** Accepts `/speak`, routes to the active device; tracks the remote sink via `/register`·`/deregister`; falls back to local TTS if the remote is unreachable. Always-on via launchd/systemd. |
| `src/voice-sink.mjs`                             | **Remote daemon.** `/speak {text}` → TTS provider → audio. Installed as a service agent by `./install.sh remote`.                                                                                          |
| `src/speak-summary.mjs`                          | **Claude Stop hook.** Waits for the transcript to settle (so it never speaks the previous turn), reads the last assistant message → `summarize` → POSTs to the router. Never throws (won't block Claude).  |
| `src/notify-cue.mjs`                             | **Claude Notification hook.** Speaks a short fixed cue when approval/input is needed.                                                                                                                      |
| `src/lib/tts/`                                   | TTS provider layer: serial speaker queue, OS-aware audio player, and provider modules (`say`, `piper`, `gemini`).                                                                                          |
| `src/lib/summarize/`                             | Summarizer layer: strips markdown/code/emoji, reduces to first sentence(s) (≤240 chars); supports heuristic, LLM HTTP, and subprocess (`command`) modes.                                                   |
| `src/lib/strings.mjs`                            | Built-in spoken-string packs (`en`, `tr`), selected by `config.language`.                                                                                                                                  |
| `src/lib/{config,http,logger,presence,pane}.mjs` | config loader · tiny HTTP helpers · rotating logger · presence watcher · per-pane override resolver.                                                                                                       |
| `bin/herdr-voice`                                | **CLI:** `start/stop/restart/status/logs/enable/disable/uninstall` — manages this machine's daemon.                                                                                                        |
| `plugin/`                                        | **herdr plugin** (`ensar.herdr-voice`): toggle (global) / toggle-pane / enable / disable actions.                                                                                                          |
| `launchd/dev.herdr-voice.plist.tmpl`             | launchd template for both the router (host) and the sink (remote). macOS only.                                                                                                                             |
| `service/dev.herdr-voice.service.tmpl`           | systemd unit template. Linux only.                                                                                                                                                                         |

Daemons + Claude hooks are **Node.js** (stdlib only); the CLI + installer are **Bash**.

______________________________________________________________________

## Requirements

- **macOS** (Apple Silicon or Intel) **or Linux** (x86-64 / ARM64).
- **[herdr](https://herdr.dev) ≥ 0.7.0** — the host installer links the herdr-voice plugin through it; keybinds, per-pane control, and presence-based remote routing all build on it.
- `node`, `jq`, `curl`, and (for the remote scenario) `tailscale`.
- A **Tailscale** mesh between your devices, if you want audio to follow you to a remote machine.

**Per-provider additional requirements:**

| Provider                     | Extra requirement                                                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `say` *(default on macOS)*   | Built into macOS — no extra install. List voices with `say -v '?'`.                                                                                                                                         |
| `piper` *(default on Linux)* | `python3 -m piper` on PATH (`pip install piper-tts`); a downloaded voice model (e.g. `en_US-lessac-medium`); an OS audio player: `afplay` (macOS), `aplay` / `paplay` (Linux ALSA/PulseAudio), or `ffplay`. |
| `gemini` *(opt-in, any OS)*  | A Google AI API key exported as `GEMINI_API_KEY` in the daemon's environment.                                                                                                                               |

______________________________________________________________________

## Quick start

### Host (where Claude Code runs)

```sh
git clone https://github.com/ensarkovankaya/herdr-voice.git
cd herdr-voice
./install.sh
```

The installer detects your OS and picks a default TTS provider (`say` on macOS, `piper` on Linux). It will:

1. Create `~/.herdr-voice/config.json` and **generate a token**. Role: `host`.
2. Add the Claude **Stop + Notification hooks** to `~/.claude/settings.json` (idempotent; existing hooks preserved).
3. Load the **voice-router** service (`launchd` on macOS, `systemd --user` on Linux) and health-check it.
4. Link the herdr plugin (`herdr plugin link plugin/`).

That's it — finish a task and you'll hear it. To toggle with keybinds, add these to `~/.config/herdr/config.toml`, then run `herdr server reload-config`:

```toml
# global on/off (whole machine)
[[keys.command]]
key = "prefix+shift+v"
type = "plugin_action"
command = "ensar.herdr-voice.toggle"
description = "herdr-voice: toggle voice (global)"

# this pane only (overrides global for the focused Claude pane)
[[keys.command]]
key = "prefix+shift+p"
type = "plugin_action"
command = "ensar.herdr-voice.toggle-pane"
description = "herdr-voice: toggle voice (this pane)"
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
| `enabled`                      | `false`       | Global master switch — hooks speak only when `true` (the router/sink always run).                                    |
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

### TTS providers

The `tts` block selects and configures the speech engine:

```jsonc
// ~/.herdr-voice/config.json
{
  "tts": {
    "provider": "say",                    // say | piper | gemini
    "say": {
      "voice": "Samantha"                 // any installed macOS voice
    },
    "piper": {
      "cmd": "python3 -m piper",          // piper executable / module
      "voice": "en_US-lessac-medium",     // voice model name (must be downloaded)
      "dataDir": "~/.herdr-voice/voices"  // directory holding voice .onnx files
    },
    "gemini": {
      "model": "gemini-2.5-flash-preview-tts",
      "voice": "Kore",
      "apiKeyEnv": "GEMINI_API_KEY",      // env var name holding your API key
      "languageCode": ""                  // e.g. "en-US"; leave empty for auto-detect
    }
  },
  "audio": {
    "player": "auto"                      // auto | afplay | aplay | paplay | ffplay
  }
}
```

| Provider | When it plays audio                                                                 |
| -------- | ----------------------------------------------------------------------------------- |
| `say`    | Self-playing — the `say` process handles output directly (macOS only).              |
| `piper`  | Synthesizes a WAV file, then `audio.player` plays it.                               |
| `gemini` | Fetches PCM from the Gemini TTS API, wraps it as WAV, then `audio.player` plays it. |

`audio.player: "auto"` tries `afplay` (macOS), then `aplay`, `paplay`, `ffplay` in order. Set it explicitly if auto-detection picks the wrong tool.

**Back-compat:** a v1 config with a top-level `"voice"` key is automatically migrated in-memory to `tts.say.voice`; no manual rewrite needed.

### Summarizer

The `summarize` block controls how the last Claude message is condensed before speaking:

```jsonc
{
  "summarize": {
    "mode": "heuristic",   // heuristic | llm | command
    "maxLen": 240
  }
}
```

| Mode        | Description                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heuristic` | *(default)* Strips markdown, code blocks, and emoji; keeps the first sentence(s) up to `maxLen` characters. No external calls.                                                                                            |
| `llm`       | Sends the text to an HTTP LLM endpoint. Configure via `summarize.llm` (URL, headers with `${ENV}` interpolation, `promptTemplate`, `bodyTemplate`, `responsePath`). Works with Gemini, OpenAI-compatible APIs, or Ollama. |
| `command`   | Runs a subprocess and reads its stdout as the summary. Example using Claude Code's own session (no API key needed):                                                                                                       |

```jsonc
{
  "summarize": {
    "mode": "command",
    "command": {
      "cmd": "claude",
      "args": ["-p", "Summarize in one spoken sentence (no markdown, no emoji): ${text}"],
      "timeoutMs": 8000
    }
  }
}
```

Every mode's output passes a final sanitization and `maxLen` cap. On any error or timeout, the summarizer falls back to `heuristic`; an empty result falls back to the fixed `fallback` string. Speech never breaks.

### Example: Turkish output

```json
{
  "language": "tr",
  "tts": {
    "provider": "say",
    "say": { "voice": "Yelda" }
  }
}
```

`language: "tr"` switches every spoken default to Turkish (`cue` → "Onayın gerekiyor.", `fallback` → "Tamamlandı.", etc.); `tts.say.voice: "Yelda"` picks the matching macOS voice. Restart the daemon after changing TTS config (`herdr-voice restart`).

______________________________________________________________________

## CLI: `herdr-voice`

Manages this machine's service daemon (router on a host, sink + watcher on a remote):

```sh
herdr-voice start       # start the daemon (launchd/systemd)
herdr-voice stop        # stop it
herdr-voice restart     # restart it
herdr-voice status      # running? + role + enabled + provider + recent logs
herdr-voice logs        # tail -f ~/.herdr-voice/logs/herdr-voice.log
herdr-voice enable      # turn voice on  (config.enabled=true)  + spoken confirmation
herdr-voice disable     # turn voice off (config.enabled=false) + spoken confirmation
herdr-voice uninstall   # remove everything (see below)
```

```text
$ herdr-voice status
herdr-voice: running | role=host | enabled=true | provider=say
```

______________________________________________________________________

## Keybinds

herdr-voice exposes herdr **plugin actions**; bind the ones you want in `~/.config/herdr/config.toml` (snippet in [Host setup](#host-where-claude-code-runs)), then run `herdr server reload-config`. `prefix` is herdr's own leader key (whatever you've set it to in herdr).

| Shortcut         | herdr action                            | What it does                                                                      |
| ---------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| `prefix+shift+v` | `ensar.herdr-voice.toggle`              | **Global master** on/off — silences or re-enables voice for the whole machine.    |
| `prefix+shift+p` | `ensar.herdr-voice.toggle-pane`         | **This pane only** — toggles voice for the focused Claude pane (opt-in override). |
| *(unbound)*      | `ensar.herdr-voice.enable` / `.disable` | Force the global master on / off (same as `herdr-voice enable` / `disable`).      |

The shortcut keys above are just suggestions — you pick them in your herdr config; the **action ids** are what matter.

**How they combine:** voice plays only when the **master is on** *and* the pane is on. A pane is "on" when its explicit override (set by `prefix+shift+p`) says so, or — with no override — when `sessionDefault` is `on`. So `prefix+shift+v` is the big switch and `prefix+shift+p` opts individual sessions in or out.

______________________________________________________________________

## Claude status line indicator

Show the voice state in your Claude Code prompt (`🔈 voice` on / `🔇 voice` off) by adding a segment to your statusLine script.

**A) Call this repo's segment script:**

```sh
seg=$("$HOME/Projects/herdr-voice/statusline/herdr-voice-segment.sh")   # "🔈 voice" / "🔇 voice"
```

**B) Or inline a colored snippet** into your own statusLine script (the one `statusLine.command` in `~/.claude/settings.json` points to):

```bash
hv=$(jq -r '.enabled // false' "$HOME/.herdr-voice/config.json" 2>/dev/null)
if [ "$hv" = "true" ]; then printf '  \033[2;32m🔈 voice\033[0m'
else                        printf '  \033[2;90m🔇 voice\033[0m'; fi
```

> This minimal snippet reflects the **global** switch only; for the per-pane state, use option A (the segment script is per-pane aware).
>
> The statusLine script belongs to Claude Code (outside this repo); it re-runs on every refresh, so no reload is needed.

______________________________________________________________________

## Logs

Everything goes to `~/.herdr-voice/logs/herdr-voice.log` (size-rotated, ~1 MB × 5), plus the service manager's own stdout/stderr logs.

`SPEAK` / `FORWARD` lines are tagged with the originating Claude session (short id) and herdr pane when known — so you can tell which session is talking:

```
[2026-06-29T11:54:19Z] [INFO] SPEAK [sess:a6aff93b pane:w653aa39818c041:p4] "Done." (local)
```

```sh
herdr-voice logs                              # tail -f the app log
tail -f ~/.herdr-voice/logs/launchd.*.log     # raw launchd stdout/stderr (macOS)
grep 'sess:a6aff93b' ~/.herdr-voice/logs/herdr-voice.log   # one session's lines
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
herdr-voice restart

# Send a manual test phrase
TOKEN=$(jq -r .token ~/.herdr-voice/config.json)
curl -X POST http://127.0.0.1:8973/speak \
  -H "X-Voice-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"Hello from herdr-voice"}'

# Watch remote presence (register/deregister) on the host
tail -f ~/.herdr-voice/logs/herdr-voice.log | grep -i register

# Plugin action history (did toggle run?)
herdr plugin log list --plugin ensar.herdr-voice
```

**No sound?** Walk the checklist: `enabled=true` → router `/health` ok → TTS provider installed/configured → OS audio player works → volume/output device → (remote) the `herdr --remote` session shows a `register` line in the host log.

**piper:** confirm `python3 -m piper --help` runs, the voice `.onnx` file is in `tts.piper.dataDir`, and an audio player (`aplay`/`paplay`/`ffplay`) is on PATH.

**gemini:** confirm `echo $GEMINI_API_KEY` is non-empty in the daemon's environment (set it in the plist/unit or export it before `herdr-voice start`).

______________________________________________________________________

## Uninstall

```sh
herdr-voice uninstall        # asks to confirm
herdr-voice uninstall --yes  # no prompt
```

Removes: the service daemon + unit file, the CLI (`~/.local/bin/herdr-voice`), and `~/.herdr-voice/` (config + token). **On a host it also** strips the herdr-voice Claude hooks from `settings.json` (others preserved) and uninstalls the herdr plugin. **By hand:** the statusLine snippet and the herdr keybinds (`prefix+shift+v`, `prefix+shift+p`).

______________________________________________________________________

## Development

```sh
node --test    # run the test suite (Node stdlib test runner, zero deps)
```

## Roadmap

- **Windows** — TTS provider (PowerShell `System.Speech`), service (Task Scheduler / NSSM), and presence detection.
- **Persistent Piper HTTP server** — `python -m piper.http_server` mode for lower-latency local synthesis.
- **Audio streaming** — Piper `--output-raw` / Gemini SSE instead of whole-utterance WAV for faster first sound.
- **Thin clients** (phone/tablet over SSH) — no local process to play audio yet.

## License

[MIT](LICENSE) © Ensar Kovankaya

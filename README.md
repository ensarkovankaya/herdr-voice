# 🔊 herdr-voice

> Spoken summaries for **Claude Code** — heard on whatever device you're actually sitting at.

herdr-voice says a short sentence out loud whenever Claude Code **finishes a task** or **needs your approval**. Working locally? It plays on your Mac. Connected from another machine with [`herdr --remote`](https://herdr.dev)? It follows you there.

It's the inverse of dictation tools like VoiceInk (which do **speech → text**); herdr-voice does **text → speech** for Claude's output only.

______________________________________________________________________

## ✨ Highlights

- 🔔 **Speaks on the moments that matter** — task done, or approval/input needed.
- 📍 **Follows you across devices** — presence-aware routing over [Tailscale](https://tailscale.com); audio plays where you are.
- 🗣️ **Pluggable TTS** — `say` (macOS built-in), `piper` (local neural, macOS + Linux), or `gemini` (cloud). Any voice, any language.
- 🧹 **Speech-friendly summaries** — markdown, code blocks, and emoji are stripped. Summarizer is pluggable too: heuristic (default), your logged-in Claude (`claude`, default model Haiku), LLM via HTTP, or any CLI command.
- 🏷️ **Knows which session is talking** — each summary and approval cue is prefixed with a short per-session label (a rolling recap of the session's theme in `claude` mode, the transcript auto-title otherwise) so you can tell which of several Claude sessions just spoke.
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

**"Active device"** = the machine whose herdr client you're sitting in front of. When you run `herdr --remote <host>`, that device registers with the host router and deregisters on exit; with no live registration the router speaks on the host. This relies only on the registration + TTL + a forward-timeout fallback — **not** on herdr's internal API.

Daemons + Claude hooks are **Node.js** (stdlib only); the CLI + installer are **Bash**. Full design, component-by-component, in **[docs/architecture.md](docs/architecture.md)**.

______________________________________________________________________

## Requirements

- **macOS** (Apple Silicon or Intel) **or Linux** (x86-64 / ARM64).
- **[herdr](https://herdr.dev) ≥ 0.7.0** — the host installer links the herdr-voice plugin through it; keybinds, per-pane control, and presence-based remote routing all build on it.
- `node`, `jq`, `curl`, and (for the remote scenario) `tailscale`.
- A **Tailscale** mesh between your devices, if you want audio to follow you to a remote machine.
- **Per-provider extras** (Piper install + voice model, or a Gemini API key) — see **[docs/providers.md](docs/providers.md)**.

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
command = "herdr-voice.toggle"
description = "herdr-voice: toggle voice (global)"

# this pane only (overrides global for the focused Claude pane)
[[keys.command]]
key = "prefix+shift+p"
type = "plugin_action"
command = "herdr-voice.toggle-pane"
description = "herdr-voice: toggle voice (this pane)"
```

`prefix+shift+v` is the global master switch; `prefix+shift+p` opts the focused pane in or out (see [Keybinds](#keybinds)).

### Remote (a second machine — optional)

Run on the **away** machine so audio follows you there when you `herdr --remote` into the host:

```sh
git clone https://github.com/ensarkovankaya/herdr-voice.git
cd herdr-voice
./install.sh remote <HOST_TAILSCALE_IP> <TOKEN> [HOST]
```

The `<TOKEN>` must match the host (`jq -r .token ~/.herdr-voice/config.json`). Then just `herdr --remote <host>` — audio routes to this device while the session is live. Full walkthrough and pairing details: **[docs/remote-setup.md](docs/remote-setup.md)**.

______________________________________________________________________

## 📚 Documentation

| Doc                                        | What's in it                                                   |
| ------------------------------------------ | -------------------------------------------------------------- |
| [Architecture](docs/architecture.md)       | Routing, presence, the speak pipeline, abstraction layers.     |
| [Configuration](docs/configuration.md)     | Complete `config.json` reference.                              |
| [Providers](docs/providers.md)             | `say` / `piper` / `gemini` setup + writing your own.           |
| [Summarizer](docs/summarizer.md)           | `heuristic` / `claude` / `llm` / `command` modes with recipes. |
| [Remote setup](docs/remote-setup.md)       | Host + remote roles so audio follows you.                      |
| [Troubleshooting](docs/troubleshooting.md) | No-sound checklist, diagnostics, logs.                         |
| [Migration v1→v2](docs/migration-v1-v2.md) | What changed and why your old config still works.              |

Also: [CONTRIBUTING.md](CONTRIBUTING.md) · [CHANGELOG.md](CHANGELOG.md)

______________________________________________________________________

## Configuration

Config lives in `~/.herdr-voice/config.json` (override with `HERD_VOICE_CONFIG`). The installer writes it; you edit it to change voices, switch providers, or localize. A minimal example — Turkish output with a macOS voice:

```json
{
  "language": "tr",
  "tts": { "provider": "say", "say": { "voice": "Yelda" } }
}
```

`language: "tr"` switches every spoken default to Turkish; `tts.say.voice` picks the voice. Restart after a TTS change: `herdr-voice restart`.

The full field reference — `tts` (say/piper/gemini), `audio.player`, the `summarize` block, timeouts, and spoken-string overrides — is in **[docs/configuration.md](docs/configuration.md)**, with provider setup in [docs/providers.md](docs/providers.md) and summarizer recipes in [docs/summarizer.md](docs/summarizer.md).

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
herdr-voice uninstall   # remove everything (see Uninstall)
```

```text
$ herdr-voice status
herdr-voice: running | role=host | enabled=true | provider=say
```

______________________________________________________________________

## Keybinds

herdr-voice exposes herdr **plugin actions**; bind the ones you want in `~/.config/herdr/config.toml` (snippet in [Host setup](#host-where-claude-code-runs)), then run `herdr server reload-config`. `prefix` is herdr's own leader key.

| Shortcut         | herdr action                      | What it does                                                      |
| ---------------- | --------------------------------- | ----------------------------------------------------------------- |
| `prefix+shift+v` | `herdr-voice.toggle`              | **Global master** on/off — whole machine.                         |
| `prefix+shift+p` | `herdr-voice.toggle-pane`         | **This pane only** — opt-in override for the focused Claude pane. |
| *(unbound)*      | `herdr-voice.enable` / `.disable` | Force the global master on / off.                                 |

The shortcut keys are suggestions — you pick them; the **action ids** are what matter. Voice plays only when the **master is on** *and* the pane is on (its explicit override, or `sessionDefault` with no override). So `prefix+shift+v` is the big switch and `prefix+shift+p` opts individual sessions in or out.

______________________________________________________________________

## Claude status line indicator

Show the voice state in your prompt by adding a segment to your statusLine script. The icon is the effective state (global master AND this pane), with the global (`G`) and per-pane (`S`) flags shown separately — e.g. `🔈 voice (G:on S:on)`, `🔇 voice (G:on S:off)` (master on, this pane muted), `🔇 voice (G:off S:on)` (master off, this pane opted in):

```sh
seg=$("$HOME/Projects/herdr-voice/statusline/herdr-voice-segment.sh")   # per-pane aware
```

The script belongs to Claude Code (outside this repo) and re-runs on every refresh, so no reload is needed. A minimal inline snippet (global switch only) is available if you'd rather not call the script — see [docs/troubleshooting.md](docs/troubleshooting.md) for log/diagnostic context.

______________________________________________________________________

## Logs & troubleshooting

Everything goes to `~/.herdr-voice/logs/herdr-voice.log` (size-rotated, ~1 MB × 5). Each line is one JSON object (NDJSON); `speak`/`forward` events carry the Claude session (id + auto title) and the herd workspace/tab/pane:

```json
{"ts":"2026-06-29T11:54:19Z","level":"INFO","event":"speak","text":"Done.","mode":"local","sessionId":"a6aff93b-243f-4a28","sessionTitle":"Logger JSON-lines refactor","workspace":"w653aa39818c041","tab":"w653aa39818c041:t3","pane":"w653aa39818c041:p4"}
```

Quick health check:

```sh
curl -fsS http://127.0.0.1:8973/health        # {"ok":true}
herdr-voice status
```

No sound, daemon won't start, or audio on the wrong device? Full diagnostics and the no-sound checklist are in **[docs/troubleshooting.md](docs/troubleshooting.md)**.

______________________________________________________________________

## Uninstall

```sh
herdr-voice uninstall        # asks to confirm
herdr-voice uninstall --yes  # no prompt
```

Removes the service daemon + unit file, the CLI (`~/.local/bin/herdr-voice`), and `~/.herdr-voice/` (config + token). On a host it also strips the herdr-voice Claude hooks from `settings.json` (others preserved) and uninstalls the herdr plugin. By hand: the statusLine snippet and the herdr keybinds.

______________________________________________________________________

## Development

```sh
npm test    # node --test — Node stdlib test runner, zero deps
```

Project layout, conventions (zero-dependency, dependency injection), and how to add providers/modes/tests are in **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Roadmap

- **Windows** — TTS provider (PowerShell `System.Speech`), service (Task Scheduler / NSSM), and presence detection.
- **Persistent Piper HTTP server** — `python -m piper.http_server` mode for lower-latency local synthesis.
- **Audio streaming** — Piper `--output-raw` / Gemini SSE instead of whole-utterance WAV for faster first sound.
- **Thin clients** (phone/tablet over SSH) — no local process to play audio yet.

## License

[MIT](LICENSE) © Ensar Kovankaya

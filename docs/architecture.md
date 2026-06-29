# Architecture

How herdr-voice turns a finished Claude Code turn into spoken audio on whatever
device you are sitting at.

## The one-paragraph version

A Claude Code **hook** fires when a turn ends or approval is needed. The hook
extracts the relevant text, summarizes it, and POSTs it to a local **router**
daemon. The router decides where the audio belongs: if you are working directly
on the host it speaks there; if you are connected from another machine over
Tailscale it **forwards** the text to a **sink** daemon on that machine, which
speaks it. The decision relies only on a lightweight presence registration plus
a forward-timeout fallback — never on herdr's internal API.

## Data flow

```
Claude Code (host) finishes a turn / needs approval
        │  Stop hook                       Notification hook
        ▼                                  (permission_prompt | idle_prompt)
  speak-summary.mjs                   notify-cue.mjs            ← Claude hooks (Node)
        │  last assistant text → summarize       │ fixed cue phrase
        └──────────────┬─────────────────────────┘
                       ▼  POST /speak {text, sessionId, pane}
              voice-router.mjs        ← host service daemon, binds 0.0.0.0:8973
                       │
        ┌──────────────┴───────────────────────────────┐
        │ active remote registered & not expired?       │
        ▼ NO                                            ▼ YES
   speak locally                              forward over Tailscale
   (TTS provider)                                     │ POST /speak
                                                      ▼
                                            voice-sink.mjs   ← remote service daemon
                                                      │ speak locally (TTS provider)
                                                      └─ on forward failure:
                                                         router drops the registration
                                                         and speaks locally instead
```

## Processes

There are two long-running daemons and two short-lived hook scripts. Only one
daemon runs per machine — which one depends on the install role.

| Process                 | Lifetime                     | Role                                                                                                                                                      |
| ----------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/voice-router.mjs`  | service daemon (host)        | Accepts `/speak`; routes to the active device or local TTS; tracks the remote sink via `/register`·`/deregister`; falls back to local on forward failure. |
| `src/voice-sink.mjs`    | service daemon (remote)      | Accepts `/speak` → local TTS; runs the presence watcher that registers this machine with the host while a remote session is live.                         |
| `src/speak-summary.mjs` | Claude **Stop** hook         | Reads the settled transcript, summarizes the last assistant message, POSTs to the router.                                                                 |
| `src/notify-cue.mjs`    | Claude **Notification** hook | POSTs a short fixed cue when approval/input is needed.                                                                                                    |

The daemons and hooks are **Node.js (stdlib only)**; the CLI, installer, and
herdr plugin actions are **Bash**.

## Presence: how audio "follows you"

"Active device" means the machine whose herdr client you are sitting in front
of. The mechanism is deliberately simple and herdr-API-free:

1. On a remote machine, `voice-sink.mjs` runs `startPresenceWatcher`
   (`src/lib/presence.mjs`). Every ~7 s it checks whether a `herdr --remote`
   session is running locally (`pgrep -fl herdr`, optionally matching
   `remoteHost`).
2. When present, it `POST /register {ip, port}` to the host router with its
   Tailscale IP (read straight from the network interfaces — CGNAT range
   `100.64.0.0/10` — so it works under launchd's minimal PATH where the
   `tailscale` CLI may be absent). It re-registers every ~30 s as a heartbeat.
3. On session exit it `POST /deregister`.
4. The router holds at most one registration `{ip, port, expiresAt}`. A
   `/speak` is forwarded only while the registration is live (`now < expiresAt`,
   default TTL 1 h). Otherwise — or if the forward POST fails or times out
   (`forwardTimeoutMs`) — the router drops the registration and speaks locally.

`decidePresenceAction()` is the pure function at the center of this (register /
deregister / noop), which is what makes the behavior unit-testable.

See [remote-setup.md](remote-setup.md) for the operational side.

## The speak pipeline

Both daemons turn text into sound through one shared component,
`makeSpeaker()` (`src/lib/tts/index.mjs`):

- **Serial queue.** Utterances run one at a time through a promise chain, so
  overlapping `/speak` calls never talk over each other.
- **Lazy provider registry.** Only the configured provider's module is
  imported, and the provider instance is cached after first use.
- **Error isolation.** A provider failure is logged and swallowed — TTS never
  throws back into the daemon.

A provider either plays audio itself (`say`) or synthesizes a WAV and hands it
to an OS-aware **player** (`piper`, `gemini`). See [providers.md](providers.md)
for the provider contract and
[configuration.md](configuration.md#audio--player-selection) for player
selection.

## Abstraction layers

The v2 design is three pluggable layers behind small factory functions:

| Layer         | Directory            | Contract                                   | Implementations                           |
| ------------- | -------------------- | ------------------------------------------ | ----------------------------------------- |
| **TTS**       | `src/lib/tts/`       | `provider.speak(text, {cfg, log, player})` | `say`, `piper`, `gemini`                  |
| **Summarize** | `src/lib/summarize/` | `summarize(text, cfg) → string`            | `heuristic`, `llm`, `command`             |
| **Service**   | `bin/lib/service.sh` | `svc_*` functions dispatched on `uname`    | launchd (macOS), systemd `--user` (Linux) |

Each layer picks its implementation from config at runtime and degrades safely:
the summarizer always falls back to the heuristic; the player is a no-op if no
audio tool is found; an unknown TTS provider falls back to `say`.

## Why dependency injection everywhere

Every module that touches the outside world (spawn, fetch, fs, timers) takes
those dependencies as injectable parameters with real defaults — e.g.
`makeCommandSummarizer({ spawn })`, `makeGeminiProvider({ fetchImpl })`,
`makePlayer({ spawn, which, platform })`. This is what lets the whole project
be tested with **zero npm dependencies** using only the Node stdlib test runner
(`node --test`): tests inject fakes instead of touching the network, the
filesystem, or real audio. See [contributing.md](../CONTRIBUTING.md).

## Configuration & strings

`loadConfig()` (`src/lib/config.mjs`) reads `~/.herdr-voice/config.json`,
migrates the v1 flat shape in memory (see
[migration-v1-v2.md](migration-v1-v2.md)), layers user values over defaults, and
resolves the language-dependent spoken strings (`src/lib/strings.mjs`, packs for
`en`/`tr`). Daemons call `loadConfig()` per request, so most config edits take
effect without a restart — **except** TTS provider changes, which are cached by
the speaker (restart with `herdr-voice restart`).

## Logging

All processes write to `~/.herdr-voice/logs/herdr-voice.log` through
`makeLogger()` (`src/lib/logger.mjs`): size-rotated (~1 MB × 5), append-only,
and fully error-swallowing so logging can never crash a daemon. `SPEAK` /
`FORWARD` lines carry a `[sess:… pane:…]` tag (`metaTag()`) so you can tell which
Claude session is talking.

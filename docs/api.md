# HTTP API reference

herdr-voice exposes a small local HTTP API on each machine. The **host**
(`role: "host"`) runs the **router** (`src/voice-router.mjs`): it accepts
`/speak` calls from hooks, forwards to a paired remote when one is
registered, keeps a ring buffer of recent utterances, and streams live
events over SSE. A **remote** (`role: "remote"`) runs the much smaller
**sink** (`src/voice-sink.mjs`): it accepts `/speak` and registers its
presence with the host.

This document covers both. Endpoints not listed here do not exist — always
check `src/voice-router.mjs` / `src/voice-sink.mjs` if in doubt.

## Base URL and auth

- Base URL: `http://127.0.0.1:8973` — host and port come from `config.json`'s
  `host` / `port` fields (see [configuration.md](configuration.md)). Other
  machines reach a host/remote over its Tailscale IP on the same port.

- Auth: every endpoint **except `GET /health`** requires the shared secret in
  an `x-voice-token` header. It must match the `token` field in
  `~/.herdr-voice/config.json` on that machine. Host and remote must be
  configured with the **same** token to pair.

- A missing or wrong token gets:

  ```json
  { "error": "unauthorized" }
  ```

  with HTTP status `401`.

- Never commit or share the real token value. Examples below use `<token>`
  as a placeholder.

## Router endpoints (host)

| Method | Path          | Auth | Purpose                                                     |
| ------ | ------------- | ---- | ----------------------------------------------------------- |
| GET    | `/health`     | no   | Liveness probe.                                             |
| GET    | `/state`      | yes  | Full snapshot: settings, remote status, panes, ring buffer. |
| GET    | `/events`     | yes  | Server-Sent Events stream of live state changes.            |
| POST   | `/register`   | yes  | A remote sink announces its presence to the host.           |
| POST   | `/deregister` | yes  | A remote sink withdraws its presence.                       |
| POST   | `/speak`      | yes  | Speak/forward/record an utterance.                          |
| POST   | `/toggle`     | yes  | Flip the global voice on/off switch.                        |
| POST   | `/audio`      | yes  | Flip the global audio-mute switch.                          |
| POST   | `/pane`       | yes  | Set or clear a per-pane voice override.                     |
| POST   | `/replay`     | yes  | Re-speak a ring-buffer entry locally.                       |

Any other method/path combination returns `404 { "error": "not found" }`.
An unparsable JSON body on a `POST` returns `400 { "error": "bad json" }`.

### `GET /health`

No auth. Always `200`:

```json
{ "ok": true }
```

### `GET /state`

Returns the router's full snapshot.

```json
{
  "enabled": true,
  "audioMuted": false,
  "sessionDefault": "on",
  "muteFocusedPane": false,
  "language": "en",
  "remote": { "present": false },
  "tts": { "providers": ["say"] },
  "summarize": { "mode": "heuristic", "authBroken": false },
  "panes": [
    { "pane": "%3", "sessionTitle": "refactor auth", "override": "on" }
  ],
  "messages": [
    {
      "id": "1719858123456-42",
      "ts": "2025-07-01T12:34:56.789Z",
      "text": "Refactored the auth module. Done.",
      "kind": "summary",
      "cueKind": null,
      "sessionId": "abc123",
      "sessionTitle": "refactor auth",
      "workspace": "herd-voice",
      "tab": "1",
      "pane": "%3",
      "mode": "local",
      "provider": "say"
    }
  ]
}
```

Field notes:

| Field                  | Meaning                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`              | Global master switch (`config.enabled`).                                                                                                                                           |
| `audioMuted`           | Global audio-mute switch (`config.audioMuted`).                                                                                                                                    |
| `sessionDefault`       | Default per-pane voice state under herdr when no override is set (`"on"` / `"off"`).                                                                                               |
| `muteFocusedPane`      | Whether the currently-focused herdr pane is kept silent.                                                                                                                           |
| `language`             | Active spoken-string language pack (`"en"`, `"tr"`, ...).                                                                                                                          |
| `remote`               | `{ present: false }` normally; while a remote is registered and unexpired: `{ present: true, ip, port, expiresAt }` (`expiresAt` is an epoch-ms timestamp).                        |
| `tts.providers`        | Ordered TTS provider fallback list, e.g. `["say"]`.                                                                                                                                |
| `summarize.mode`       | Active summarizer mode (`heuristic` / `llm` / `command` / `claude`).                                                                                                               |
| `summarize.authBroken` | `true` when the `claude` summarizer mode last reported a login/auth failure (via the `summarizeAuthError` flag on `/speak`).                                                       |
| `panes`                | Distinct panes seen in the ring buffer, newest first: `{ pane, sessionTitle, override }`. `override` is `"on"`, `"off"`, or `null` (no override — falls back to `sessionDefault`). |
| `messages`             | The ring buffer (most recent `ringSize` entries, default 50), oldest first. See entry fields below.                                                                                |

Ring buffer entry (`messages[]`) fields:

| Field          | Meaning                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `id`           | Unique id, `"<epochMs>-<seq>"`.                                                                   |
| `ts`           | ISO 8601 timestamp.                                                                               |
| `text`         | The spoken text, capped at 500 chars.                                                             |
| `kind`         | `"summary"` (default) or any `kind` sent to `/speak` (e.g. `"cue"`).                              |
| `cueKind`      | Optional sub-kind for cue-type messages (e.g. which notification triggered it), or `null`.        |
| `sessionId`    | Claude session id, or `""`.                                                                       |
| `sessionTitle` | Human-readable session title, or `""`.                                                            |
| `workspace`    | Workspace name, or `""`.                                                                          |
| `tab`          | herdr tab id, or `""`.                                                                            |
| `pane`         | herdr pane id, or `""`.                                                                           |
| `mode`         | How it was delivered: `"local"` (spoke here), `"remote"` (forwarded), or `"muted"` (audio muted). |
| `provider`     | TTS provider used for `mode: "local"` (e.g. `"say"`); `null` for `"remote"`/`"muted"`.            |

### `GET /events`

Server-Sent Events (`content-type: text/event-stream`). On connect the
router writes a `: connected` comment, then a `: ping` comment every 20s to
keep the connection alive. Each state change is pushed as an
`event: <name>\ndata: <json>\n\n` frame.

**`speak`** — broadcast on every recorded utterance, with the **full
ring-buffer entry** (same shape as one element of `/state`'s `messages`
array, documented above). This is not in `STREAM_EVENTS` — it is broadcast
directly wherever a message is recorded.

All other events come from `STREAM_EVENTS` (`src/lib/events.mjs`) via the
streaming logger; each payload is `{ ts, ...fields }`:

| Event                 | Fields               | Fired when                                                                                |
| --------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `toggle`              | `enabled, source`    | `POST /toggle` flips the global switch.                                                   |
| `audio`               | `audioMuted, source` | `POST /audio` flips the mute switch.                                                      |
| `summarize_auth`      | `broken`             | The `claude` summarizer's login/auth state changes (via `/speak`'s `summarizeAuthError`). |
| `pane_override`       | `pane, override`     | `POST /pane` sets or clears a pane override.                                              |
| `tts_fallback`        | provider-specific    | A TTS provider fails and the speaker falls back to the next one.                          |
| `tts_spoke`           | provider-specific    | A TTS provider successfully produces audio.                                               |
| `register`            | `ip, port`           | `POST /register` — a remote sink registers with this host.                                |
| `deregister`          | *(none)*             | `POST /deregister` — a remote sink withdraws.                                             |
| `presence_register`   | `ip, port, target`   | This machine (as a remote) registers itself with its host.                                |
| `presence_deregister` | `target`             | This machine (as a remote) deregisters itself.                                            |

Example frame:

```
event: toggle
data: {"ts":"2025-07-01T12:00:00.000Z","enabled":true,"source":"app"}

```

### `POST /register`

Called by a remote sink's presence watcher to announce itself to the host.

Request:

```json
{ "ip": "100.101.102.103", "port": 8973, "ttlMs": 3600000 }
```

- `ip` — required; `400 { "error": "ip required" }` if missing.
- `port` — optional, defaults to `8973`.
- `ttlMs` — optional, defaults to `config.remoteTtlMs` (1 hour). The
  registration is considered live until `now + ttlMs`.

Response `200`:

```json
{ "ok": true, "remote": { "ip": "100.101.102.103", "port": 8973 } }
```

### `POST /deregister`

No body required. Clears the registered remote.

Response `200`:

```json
{ "ok": true }
```

### `POST /speak`

The main entry point hooks use to speak/forward/record an utterance.
Responds immediately with `202` (fire-and-forget) — the actual TTS/forward
happens asynchronously, and the utterance is appended to the ring buffer and
broadcast as a `speak` SSE event regardless of delivery mode.

Request body fields (all optional except `text`):

| Field                | Meaning                                                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`               | The text to speak (capped at 500 chars).                                                                                                                                                                             |
| `sessionId`          | Claude session id.                                                                                                                                                                                                   |
| `sessionTitle`       | Human-readable session title.                                                                                                                                                                                        |
| `workspace`          | Workspace name.                                                                                                                                                                                                      |
| `tab`                | herdr tab id.                                                                                                                                                                                                        |
| `pane`               | herdr pane id.                                                                                                                                                                                                       |
| `kind`               | Message kind, e.g. `"summary"` (default) or `"cue"`.                                                                                                                                                                 |
| `cueKind`            | Sub-kind for cue-type messages.                                                                                                                                                                                      |
| `summarizeAuthError` | Only meaningful when `kind` is `"summary"` (the default): `true` if the `claude` summarizer mode's login/auth is broken. Drives `/state`'s `summarize.authBroken` and the `summarize_auth` SSE event on transitions. |

```json
{
  "text": "Refactored the auth module. Done.",
  "sessionId": "abc123",
  "sessionTitle": "refactor auth",
  "workspace": "herd-voice",
  "tab": "1",
  "pane": "%3",
  "kind": "summary",
  "cueKind": null,
  "summarizeAuthError": false
}
```

Response `202`:

```json
{ "ok": true }
```

Delivery: if `audioMuted` is set, the utterance is recorded/broadcast but
never spoken or forwarded (`mode: "muted"`). Otherwise, if a remote is
registered and unexpired, the text is forwarded to its `/speak` (`mode: "remote"`); on forward failure the router falls back to speaking locally.
Otherwise it speaks locally with `tts.providers[0]` (`mode: "local"`).

### `POST /toggle`

No body required. Flips `config.enabled`. If turning voice **on**, also
speaks/records `config.voiceOnText`.

Response `200`:

```json
{ "enabled": true }
```

### `POST /audio`

No body required. Flips `config.audioMuted`.

Response `200`:

```json
{ "audioMuted": true }
```

### `POST /pane`

Sets or clears a per-pane voice override (used by herdr's per-pane
mute/unmute keybind).

Request:

```json
{ "pane": "%3", "override": "off" }
```

- `pane` — required string; `400 { "error": "pane required" }` if missing/empty.
- `override` — `"on"`, `"off"`, or anything else (including omitted), which
  clears the override back to `null` (falls back to `sessionDefault`).

Response `200`:

```json
{ "ok": true, "pane": "%3", "override": "off" }
```

### `POST /replay`

Re-speaks a ring-buffer entry locally. Explicit user action (e.g. from the
menu-bar app) — speaks even when `audioMuted` is set, and does **not**
re-record the entry or emit another `speak` SSE event.

Request:

```json
{ "id": "1719858123456-42" }
```

- `id` — optional. If omitted, replays the most recent message in the ring
  buffer.

Response `200`:

```json
{ "ok": true, "id": "1719858123456-42" }
```

`404 { "error": "no message" }` if the ring buffer is empty or `id` doesn't
match any entry.

## Sink endpoints (remote)

The sink (`src/voice-sink.mjs`) is much smaller — it only speaks what it's
told and reports its own health. It does not expose `/state`, `/events`, or
any of the router's control endpoints.

| Method | Path      | Auth | Purpose                        |
| ------ | --------- | ---- | ------------------------------ |
| GET    | `/health` | no   | Liveness probe.                |
| POST   | `/speak`  | yes  | Speak text sent by the router. |

### `GET /health`

Same shape as the router's: `200 { "ok": true }`, no auth.

### `POST /speak`

Called by a host router's `forward()` when this machine is the registered
remote.

Request:

```json
{
  "text": "Refactored the auth module. Done.",
  "sessionId": "abc123",
  "sessionTitle": "refactor auth",
  "workspace": "herd-voice",
  "tab": "1",
  "pane": "%3"
}
```

If this sink's own `config.enabled` is `false`, it does nothing and
responds `200 { "skipped": true }` (no `202`). Otherwise it responds `202 { "ok": true }` and speaks locally with `tts.providers[0]`.

## Presence (remote → host)

Not an HTTP endpoint of its own — `src/lib/presence.mjs` runs on a remote
and periodically calls the host's `POST /register` / `POST /deregister`
(above) to reflect whether a `herdr --remote` session is currently active on
that machine. See [remote-setup.md](remote-setup.md) for the host/remote
pairing flow.

## See also

- [configuration.md](configuration.md) — `config.json` fields referenced
  throughout this document (`token`, `host`, `port`, `tts`, `summarize`, ...).
- [remote-setup.md](remote-setup.md) — host/remote pairing and presence.
- [architecture.md](architecture.md) — how these endpoints fit into the
  end-to-end speak pipeline.

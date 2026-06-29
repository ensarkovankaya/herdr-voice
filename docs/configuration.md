# Configuration reference

herdr-voice reads a single JSON file. The default location is
`~/.herdr-voice/config.json`; override it with the `HERD_VOICE_CONFIG`
environment variable (used by tests and for running multiple roles on one
machine).

The installer writes this file for you. You only edit it to change voices,
switch providers, tweak the summarizer, or localize the spoken strings. Most
edits take effect on the next `/speak` because daemons reload config per
request — **TTS provider changes are the exception** and need
`herdr-voice restart`.

## Top-level fields

| Field                          | Default                                     | Description                                                                                                          |
| ------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `token`                        | *(generated)*                               | Shared secret sent as the `X-Voice-Token` header. Must be identical on host and remote.                              |
| `host`                         | `127.0.0.1`                                 | The router address **this** machine talks to. `127.0.0.1` on a host; the host's Tailscale IP on a remote.            |
| `port`                         | `8973`                                      | Router/sink listen port.                                                                                             |
| `language`                     | `en`                                        | Built-in spoken-string pack: `en` or `tr`. Drives the defaults for `cue`, `fallback`, `voiceOnText`, `voiceOffText`. |
| `enabled`                      | `true` (installer) / `false` (bare default) | Global master switch. Hooks and the toggle speak only when `true`; the router/sink always run regardless.            |
| `sessionDefault`               | `on`                                        | Under herdr, the default for a pane with no explicit override: `on` (talk) or `off` (opt-in per pane via keybind).   |
| `role`                         | `host`                                      | `host` (runs the router) or `remote` (runs the sink + presence watcher).                                             |
| `remoteHost`                   | `""`                                        | On a remote, scopes which `herdr --remote <host>` session counts as present (empty = any session).                   |
| `remoteTtlMs`                  | `3600000`                                   | Safety expiry for a remote registration (1 h).                                                                       |
| `forwardTimeoutMs`             | `1500`                                      | Router→sink forward timeout (ms). On timeout the router falls back to local.                                         |
| `postTimeoutMs`                | `1500`                                      | Hook→router POST timeout (ms).                                                                                       |
| `cue`                          | *(from pack)*                               | Spoken when approval/input is needed.                                                                                |
| `fallback`                     | *(from pack)*                               | Spoken when the summary is empty.                                                                                    |
| `voiceOnText` / `voiceOffText` | *(from pack)*                               | Spoken when toggling voice on/off.                                                                                   |

Any spoken string can be overridden individually: set `cue`, `fallback`,
`voiceOnText`, or `voiceOffText` in the file and it wins over the language pack.

## `tts` — speech engine

Selects the provider and carries one settings block per provider. Only the
selected provider's block is used, but all blocks are merged over defaults so
switching providers is just a `provider` change.

```jsonc
{
  "tts": {
    "provider": "say",                    // say | piper | gemini
    "say": {
      "voice": "Samantha"                 // any installed macOS voice (say -v '?')
    },
    "piper": {
      "cmd": "python3 -m piper",          // piper executable / module launcher
      "voice": "en_US-lessac-medium",     // voice model name (must be downloaded)
      "dataDir": "~/.herdr-voice/voices"  // directory holding the voice .onnx files
    },
    "gemini": {
      "model": "gemini-2.5-flash-preview-tts",
      "voice": "Kore",
      "apiKeyEnv": "GEMINI_API_KEY",      // env var NAME that holds your API key
      "languageCode": ""                  // e.g. "en-US"; empty = auto-detect
    }
  }
}
```

Defaults by OS: `say` on macOS, `piper` elsewhere. See
[providers.md](providers.md) for per-provider setup and the full provider
contract.

## `audio` — player selection

Only used by providers that synthesize a WAV (`piper`, `gemini`). The `say`
provider plays its own audio and ignores this block.

```jsonc
{
  "audio": {
    "player": "auto"   // auto | afplay | aplay | paplay | ffplay | "<cmd> ${file}"
  }
}
```

- `"auto"` tries the platform defaults in order: `afplay` (macOS), then
  `paplay`, `aplay`, `ffplay`, `play` (Linux). The first one found on `PATH`
  wins.
- A bare binary name (e.g. `"afplay"`) forces that player.
- A template containing `${file}` is split into command + args, with `${file}`
  replaced by the WAV path — e.g. `"ffplay -nodisp -autoexit ${file}"`.

If no player resolves, audio is a silent no-op (the daemon does not crash).

## `summarize` — how the message is condensed

```jsonc
{
  "summarize": {
    "mode": "heuristic",   // heuristic | llm | command
    "maxLen": 240,         // hard character cap applied to every mode's output
    "llm": { /* ... */ },     // used when mode = "llm"
    "command": { /* ... */ }  // used when mode = "command"
  }
}
```

`maxLen` caps the final spoken string in every mode. On any error or timeout the
summarizer falls back to `heuristic`; an empty heuristic result falls back to
the fixed `fallback` string. Full details and recipes:
[summarizer.md](summarizer.md).

## Spoken strings & localization

`language` picks a built-in pack (`src/lib/strings.mjs`):

| Key        | `en`               | `tr`                |
| ---------- | ------------------ | ------------------- |
| `cue`      | "Approval needed." | "Onayın gerekiyor." |
| `fallback` | "Done."            | "Tamamlandı."       |
| `voiceOn`  | "Voice on."        | "Ses açıldı."       |
| `voiceOff` | "Voice off."       | "Ses kapandı."      |

Override any single phrase by setting the matching top-level field
(`cue`/`fallback`/`voiceOnText`/`voiceOffText`). The language pack also seeds
sensible defaults; you do not need to set these unless you want custom wording.

## Environment variables

| Variable                                                        | Used by           | Purpose                                                                                                                                 |
| --------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `HERD_VOICE_CONFIG`                                             | all               | Override the config path.                                                                                                               |
| `HERD_VOICE_BIND`                                               | daemons           | Bind address (set to `0.0.0.0` by the service unit).                                                                                    |
| `HERDR_PANE_ID`                                                 | hooks, statusline | Identifies the current herdr pane for per-pane voice state.                                                                             |
| `GEMINI_API_KEY` (name configurable via `tts.gemini.apiKeyEnv`) | gemini provider   | Holds the Google AI API key. Must be present in the **daemon's** environment — the installer injects it into the service unit when set. |

## Example: Turkish output with a macOS voice

```json
{
  "language": "tr",
  "tts": {
    "provider": "say",
    "say": { "voice": "Yelda" }
  }
}
```

`language: "tr"` switches every spoken default to Turkish; `tts.say.voice`
picks the matching macOS voice. Restart after a TTS change:
`herdr-voice restart`.

## See also

- [providers.md](providers.md) — provider setup and the `speak()` contract
- [summarizer.md](summarizer.md) — `llm` / `command` recipes
- [remote-setup.md](remote-setup.md) — host/remote roles and presence
- [migration-v1-v2.md](migration-v1-v2.md) — the old flat `voice` key

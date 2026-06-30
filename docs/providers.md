# TTS providers

A provider turns text into sound. herdr-voice ships three — `say`, `piper`,
`gemini` — and adding your own is a single small module. This page covers
setup for each shipped provider and the contract for writing a new one.

Select and configure providers in the `tts` block of `config.json`; see
[configuration.md](configuration.md#tts--speech-engine).

## Provider priority & fallback

`tts.providers` is an ordered list, tried until one produces audio:

```jsonc
{ "tts": { "providers": ["gemini", "piper", "say"] } }
```

Each provider's `speak()` returns `{ ok, reason }`. On a synth/API failure
(`no_key`, `http_429` quota, `no_audio`, `spawn_failed`, `exit_<n>`, …) the
speaker logs `tts_fallback {provider, reason, next}` and moves to the next
provider; the one that finally speaks after a fallback logs
`tts_spoke {provider}`. If all fail it logs `tts_all_failed {providers}`. A
*playback* (audio-device) error does not trigger fallback — the same player is
shared by every provider. Omitting `providers` falls back to the single
`provider` string (default `say`), so existing configs keep working.

## How playback works

A provider is one of two kinds:

- **Self-playing** — it sends audio to the output device itself. `say` is the
  only one; it ignores the `audio.player` setting.
- **Synth-to-file** — it writes a WAV to a temp dir and calls the injected
  `player(file)`, which spawns an OS audio tool. `piper` and `gemini` work this
  way and respect `audio.player` (see
  [configuration.md](configuration.md#audio--player-selection)).

Whichever kind, the speaker queue runs utterances one at a time. A provider
failure never breaks the daemon: the speaker falls back to the next provider in
`tts.providers` and only goes silent for that utterance if every provider
fails (each step logs a `WARN`).

## `say` (macOS, default there)

Built into macOS — nothing to install.

```jsonc
{ "tts": { "provider": "say", "say": { "voice": "Samantha" } } }
```

- List available voices: `say -v '?'`.
- Enhanced/premium voices appear once downloaded in **System Settings →
  Accessibility → Spoken Content → System Voice → Manage Voices** (e.g.
  `"Samantha (Enhanced)"`, `"Yelda (Enhanced)"`).
- No `audio.player` needed — `say` plays directly.

## `piper` (local neural, macOS + Linux, default on Linux)

[Piper](https://github.com/OHF-Voice/piper1-gpl) runs a neural voice fully
offline. herdr-voice invokes it as a subprocess to synthesize a WAV, then plays
that WAV.

**1. Install Piper** so that the configured `cmd` runs:

```sh
pip install piper-tts          # provides `python3 -m piper`
python3 -m piper --help        # verify
```

**2. Download a voice model** into `tts.piper.dataDir`. Each voice is an
`.onnx` file plus its `.onnx.json`:

```sh
mkdir -p ~/.herdr-voice/voices
python3 -m piper.download_voices en_US-lessac-medium --data-dir ~/.herdr-voice/voices
```

**3. Ensure an audio player** is on `PATH`: `afplay` (macOS) or
`aplay`/`paplay`/`ffplay`/`play` (Linux).

```jsonc
{
  "tts": {
    "provider": "piper",
    "piper": {
      "cmd": "python3 -m piper",
      "voice": "en_US-lessac-medium",
      "dataDir": "~/.herdr-voice/voices"
    }
  },
  "audio": { "player": "auto" }
}
```

`cmd` may be a multi-word launcher (it is split on whitespace); the provider
appends `-m <voice> --data-dir <dataDir> -f <tmp>.wav -- <text>`.

## `gemini` (cloud, any OS, opt-in)

Uses Google's [Gemini TTS](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts)
`generateContent` endpoint. The API returns headerless PCM; herdr-voice wraps
it in a WAV header and plays it.

**1. Get a Google AI API key.** Provide it one of two ways: set `apiKey`
inline in the config block (simplest, but the key then lives in
`config.json`), or export it in the **daemon's** environment under the name
you configure (`apiKeyEnv`, default `GEMINI_API_KEY`) — the host installer
injects this into the service unit when the variable is set at install time;
otherwise set it in the plist/unit or export it before `herdr-voice start`.
`apiKey` wins when both are set.

**2. Configure:**

```jsonc
{
  "tts": {
    "provider": "gemini",
    "gemini": {
      "model": "gemini-2.5-flash-preview-tts",
      "voice": "Kore",
      "apiKeyEnv": "GEMINI_API_KEY",  // or set "apiKey": "AIza…" inline instead
      "languageCode": ""
    }
  },
  "audio": { "player": "auto" }
}
```

If the key env var is missing, the provider logs a `WARN` and stays silent
(never crashes). Other voices and the language list are in Google's docs.

## Writing a new provider

A provider is a module exporting a factory that returns an object with a
`name` and an async `speak`:

```js
// src/lib/tts/providers/myprovider.mjs
export function makeMyProvider({ /* inject deps with real defaults */ } = {}) {
  return {
    name: 'myprovider',
    async speak(text, { cfg, log, player }) {
      // cfg     — full config; your block is cfg.tts.myprovider
      // log     — log(level, msg); levels are 'INFO' | 'WARN'
      // player  — player(wavPath) plays a file (use for synth-to-file)
      //
      // Either play audio yourself, or synthesize a WAV and call player(wav).
      // Never throw — log and return on any error.
    },
  };
}
```

Contract rules, all enforced by the existing providers as examples:

1. **Factory + injection.** Export `make<Name>Provider({...} = {})` and take
   every side-effecting dependency (spawn, fetch, fs) as an injectable
   parameter with a real default. This is what keeps the provider testable
   without touching the real subprocess/network. See `providers/say.mjs`
   (self-playing) and `providers/piper.mjs` / `providers/gemini.mjs`
   (synth-to-file) for the patterns.
2. **Never throw.** Catch everything; `log('WARN', ...)` and return. The speaker
   queue already swallows errors, but failing quietly keeps logs clean.
3. **Clean up temp files.** If you synth to a temp dir, remove it in a
   `try/catch` after `player()` resolves.
4. **Read your settings from `cfg.tts.<name>`** and add sensible defaults to
   `TTS_DEFAULTS` in `src/lib/config.mjs` so config merging populates your
   block.

Register it in the lazy factory map in `src/lib/tts/index.mjs`:

```js
const FACTORIES = {
  say: () => import('./providers/say.mjs').then((m) => m.makeSayProvider()),
  piper: () => import('./providers/piper.mjs').then((m) => m.makePiperProvider()),
  gemini: () => import('./providers/gemini.mjs').then((m) => m.makeGeminiProvider()),
  myprovider: () => import('./providers/myprovider.mjs').then((m) => m.makeMyProvider()),
};
```

Only the selected provider's module is imported at runtime, so adding one costs
nothing until it is chosen. Add a test under `test/provider-myprovider.test.mjs`
that injects a fake spawn/fetch (see the existing provider tests) and update
`defaultVoice()` in `src/lib/tts/platform.mjs` if your provider has a sensible
default voice. See [contributing.md](../CONTRIBUTING.md).

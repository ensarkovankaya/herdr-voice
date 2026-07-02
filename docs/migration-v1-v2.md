# Migrating from v1 to v2

v2 makes herdr-voice cross-platform with pluggable TTS providers and a
configurable summarizer. Almost everything in your config carries over
unchanged — the **one** field that moved is the voice, and updating it is a
one-line edit (or just pick your voice again in the installer).

## What changed

| Area         | v1                     | v2                                                |
| ------------ | ---------------------- | ------------------------------------------------- |
| Platforms    | macOS only             | macOS + Linux (Windows on the roadmap)            |
| TTS          | `say` only, hardcoded  | pluggable: `say`, `piper`, `gemini`               |
| Voice config | flat top-level `voice` | nested `tts.say.voice`                            |
| Summarizer   | fixed heuristic        | `heuristic` (default), `llm`, `command`, `claude` |
| Audio output | implicit (`say` plays) | OS-aware `audio.player` for synth providers       |
| Service mgmt | launchd only           | launchd (macOS) + systemd `--user` (Linux)        |
| Plugin id    | `ensar.herdr-voice`    | `herdr-voice`                                     |

## Config: the only field that moved

v1 stored the voice as a flat key:

```json
{ "voice": "Samantha" }
```

v2 nests it under the provider block:

```json
{ "tts": { "providers": ["say"], "say": { "voice": "Samantha" } } }
```

v2 does **not** auto-migrate the old flat `voice` — it's simply ignored, and an
un-edited v1 config falls back to the default voice (`Samantha`). To keep your
voice, either move it under `tts.say.voice` by hand as shown above, or just
re-run the installer and pick your voice when prompted. This is a one-time edit.

All other v1 fields (`token`, `host`, `port`, `language`, `enabled`,
`sessionDefault`, `role`, timeouts, spoken-string overrides) are unchanged.

### Later change: `tts.provider` → `tts.providers`

A subsequent update replaced the single `tts.provider` string with an ordered
`tts.providers` fallback list (`providers[0]` is the active engine, the rest
are tried in order if it fails). If your config still has the old singular
`tts.provider` key, it is **auto-migrated** into `tts.providers` on first load
— the file is rewritten once, with `provider` folded into `providers` and then
removed. No user action needed.

## Upgrading an existing install

```sh
cd herdr-voice
git pull
./install.sh          # host   (re-detects OS, preserves your existing config)
# or
./install.sh remote <HOST_IP> <TOKEN> [HOST]   # remote
```

Re-running the installer is idempotent: it preserves an existing
`config.json` (only patching a missing token and forcing `role`), refreshes the
service unit (now with injected `PATH`), and re-links the plugin under its new
id.

## Plugin id rename

The herdr plugin id changed from `ensar.herdr-voice` to `herdr-voice`. If you
bound keybinds against the old id, update the action ids in
`~/.config/herdr/config.toml` and run `herdr server reload-config`:

```toml
command = "herdr-voice.toggle"        # was: ensar.herdr-voice.toggle
command = "herdr-voice.toggle-pane"   # was: ensar.herdr-voice.toggle-pane
```

## New things you can now opt into

- **A neural local voice** without the cloud — `piper`. See
  [providers.md](providers.md).
- **Smarter summaries** via your logged-in Claude (`command` mode,
  `claude -p`) or any HTTP LLM (`llm` mode). See [summarizer.md](summarizer.md).
- **Running on Linux** as a `systemd --user` service.

None of these are required; an upgraded v1 install keeps speaking with `say`
exactly as before.

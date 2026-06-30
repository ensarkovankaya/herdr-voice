# Changelog

All notable changes to herdr-voice are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-06-29

Cross-platform release with pluggable speech and summarization. Current
pre-release: `2.0.0-rc.7`. See [docs/migration-v1-v2.md](docs/migration-v1-v2.md).

### Added

- **Linux support** — the daemon now installs as a `systemd --user` service
  alongside macOS launchd, via an OS-dispatching service layer
  (`bin/lib/service.sh`).
- **Pluggable TTS providers** — `say` (macOS, default there), `piper` (local
  neural, macOS + Linux, default elsewhere), and `gemini` (cloud, opt-in),
  selected by `tts.provider`. New providers plug in through a lazy registry and
  a small `speak()` contract. See [docs/providers.md](docs/providers.md).
- **OS-aware audio player** for synth providers (`afplay`/`aplay`/`paplay`/
  `ffplay`/`play`), configurable via `audio.player`, including a `${file}`
  command template.
- **Configurable summarizer** — `heuristic` (default), `claude` (your logged-in
  Claude CLI; `model` defaults to `haiku`, with configurable summary `language`
  and `prompt`), `llm` (any HTTP endpoint described by templates), and `command`
  (arbitrary subprocess), with a safe fallback chain. See
  [docs/summarizer.md](docs/summarizer.md).
- **Documentation set** under `docs/` (architecture, configuration, providers,
  summarizer, remote setup, troubleshooting, migration) plus `CONTRIBUTING.md`.
- **JSON locale packs** (`src/lib/locales/`) as the single source of truth for
  spoken strings, read by both the Node daemons and the Bash CLI/plugin (via
  `jq`). Add a language by dropping a `<lang>.json` file — no code change.
- WAV header wrapping (`pcmToWav`) for providers that return raw PCM (Gemini).
- **Idle vs. permission cue** — Notification hooks branch on `notification_type`:
  an `idle_prompt` (Claude idle, waiting for you) speaks the new `cueIdle` string,
  while permission prompts and other notifications keep `cue` (fallback to `cue`
  when unset). New locale/config key `cueIdle` (`en`: "Waiting for you.", `tr`:
  "Seni bekliyorum.").

### Changed

- **Config schema is now nested** (`tts` / `audio` / `summarize` blocks). The v1
  flat `voice` key is no longer auto-migrated — move it under `tts.say.voice` or
  re-run the installer. See [docs/migration-v1-v2.md](docs/migration-v1-v2.md).
- **Plugin id renamed** `ensar.herdr-voice` → `herdr-voice`.
- The CLI `status` now reports the active TTS `provider`.
- The installer prompts for a provider (interactive) and injects `PATH` (and the
  Gemini key env var when set) into the service unit.
- Daemons and hooks remain Node.js stdlib-only; the entire codebase is now
  dependency-injected and unit-tested with the Node stdlib test runner.
- **Logs are now structured JSON lines (NDJSON)** — one object per line
  (`{ts, level, event, …fields}`) instead of free-text. `speak`/`forward` events
  carry `sessionId`/`pane` fields; the Bash CLI and plugin toggle emit the same
  shape (`"event":"toggle"`). Parse with `jq`. Old plain-text lines age out via
  rotation.
- **Richer log fields** — `speak`/`forward` events also carry the herd
  `workspace` / `tab` ids and, on summary events, `sessionTitle` (Claude's
  transcript auto-title), alongside `sessionId` / `pane`. Empty fields are
  dropped from each JSON line.

### Removed

- v1 single-purpose modules (`src/lib/speak.mjs`, `src/lib/summarize.mjs`) and
  the macOS-only assumptions, replaced by the provider/summarizer abstractions.

## [1.0.0] — 2026-06-29

Initial release.

### Added

- Spoken Claude Code summaries via macOS `say`.
- Presence-aware host→remote routing over Tailscale (`voice-router` /
  `voice-sink`) with a forward-timeout local fallback.
- Claude Stop + Notification hooks; transcript-settle read to avoid speaking the
  previous turn.
- Speech-friendly heuristic summarization (markdown/code/emoji stripping).
- herdr plugin with global / per-pane voice toggles; rotating logs; launchd
  service; one-command install/uninstall.

[1.0.0]: https://github.com/ensarkovankaya/herdr-voice/releases/tag/v1.0.0
[2.0.0]: https://github.com/ensarkovankaya/herdr-voice/releases/tag/v2.0.0-rc.7

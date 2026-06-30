# Changelog

All notable changes to herdr-voice are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-06-29

Cross-platform release with pluggable speech and summarization. Current
pre-release: `2.0.0-rc.11`. See [docs/migration-v1-v2.md](docs/migration-v1-v2.md).

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
- **Session-aware spoken prefix** — every Stop summary and Notification cue is
  prefixed with a short per-session label so multi-session audio is attributable
  ("Search app release: approval needed."). In `claude` summarize mode it's a
  rolling recap of the session's theme, regenerated every
  `summarize.recap.everyTurns` turns (default 5) from the previous recap plus the
  turns since; in other modes it's Claude's transcript auto-title. Cached per
  session under `~/.herdr-voice/sessions/` (pruned after
  `summarize.recap.pruneAfterDays`, default 30); the cue path reads the cache
  with no extra LLM call. New config: the `summarize.recap` block
  (`enabled`/`everyTurns`/`maxLen`/`pruneAfterDays`/`prompt`) and the
  `recapTemplate` join string (`${recap}: ${body}`). See
  [docs/summarizer.md](docs/summarizer.md).
- **`herdr-voice version`** — new CLI subcommand printing the package version
  (also `--version` / `-v`); works without a config or a running daemon. The
  installer now deploys `package.json` to `~/.herdr-voice/` as the version
  source.

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
- **statusLine segment shows global and per-pane state separately** — the icon
  stays the effective state (global master AND this pane), now annotated with
  the `G` (global) and `S` (this pane's preference) flags, e.g. `🔈 voice (G:on S:on)` / `🔇 voice (G:on S:off)`.
- **`speak` log lines carry the active TTS `provider` and `voice`** — every
  spoken utterance (local on the host and on the remote sink) records which
  engine and voice model said it, e.g.
  `"provider":"piper","voice":"tr_TR-dfki-medium"`. `forward` events are
  unchanged (synthesis happens on the remote sink, which logs its own provider).

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
[2.0.0]: https://github.com/ensarkovankaya/herdr-voice/releases/tag/v2.0.0-rc.11

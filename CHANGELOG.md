# Changelog

All notable changes to herdr-voice are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] — 2026-07-03

The desktop release: a native macOS menu-bar companion app on top of a new
live router API, notifications-only mode, per-pane control from the UI, and a
summarizer health surface. One breaking config change (`tts.provider`,
auto-migrated).

### Added

- **HerdrVoiceBar — macOS menu-bar app** (`app/macos/`, SwiftPM, builds with
  Command Line Tools only; ad-hoc-signed bundle via `build-app.sh`, one-shot
  install via `install-app.sh`):
  - Live status menu fed by the router's SSE stream: two-line status header
    (state + engine chain + summarizer mode), recent messages with two-line
    rows and colored kind dots, SF Symbol icons.
  - Pause/resume (global master), **Sesli oku** toggle (audio mute), and a
    **Bildirimler** mode submenu (Tümü / Sadece onay / Kapalı) with desktop
    notifications delivered via `osascript` (ad-hoc bundles can't use
    `UNUserNotification`).
  - **Per-message quick actions** — re-speak (replay) and copy; utility rows
    to open the log/config files and restart the router service.
  - **Pane sesleri** — per-pane voice override submenu (Varsayılan / Açık /
    Kapalı), writing the same `~/.herdr-voice/panes/` override files the
    hooks and the herdr keybind already use.
  - **Launch at login** via `SMAppService` with LaunchAgent-plist fallback
    and a one-time, self-healing migration (handles `requiresApproval`).
  - **Summarizer health surface** — an "Özet: <mode>" row, a menu warning
    plus a one-shot notification when the Claude CLI session drops
    (`/login` needed).
- **Router live API** (documented in the new [docs/api.md](docs/api.md)):
  `GET /state` (full snapshot incl. messages, panes, summarize status),
  `GET /events` (SSE), `POST /toggle`, `POST /audio`, `POST /replay`
  (re-speak a recent message — bypasses mute, never re-records) and
  `POST /pane` (per-pane override), plus a persisted recent-message ring
  buffer (`history.jsonl`).
- **Notifications-only mode** — `audioMuted` keeps recording/broadcasting
  utterances (so the menu and notifications stay live) without speaking or
  forwarding.
- **Summarizer auth detection** — Claude CLI logouts are classified
  (`isAuthFailure`), reported by the Stop hook (`summarizeAuthError`), logged
  once per transition (`summarize_auth`), and exposed in
  `/state.summarize.authBroken`.
- Utterances now carry `kind` / `cueKind` metadata end to end (hooks → router
  → SSE → app), driving notification policy and menu dots.

### Changed

- **BREAKING: `tts.provider` is gone — `tts.providers` (ordered fallback
  list) is the single source of truth**; `providers[0]` is the active engine.
  Existing configs are migrated automatically on first load (one-time,
  key-preserving rewrite; a legacy `provider` folds into `providers`). The
  CLI, installer, and docs now speak providers-only.
- The Stop hook reports summarizer auth failures to the router on
  `POST /speak`.

### Fixed

- Claude CLI auth errors ("Not logged in · Please run /login") are never
  spoken or cached as summaries/recaps: non-zero exits reject (with stdout
  attached), error-shaped stdout is rejected, and the recap store can no
  longer be poisoned.
- Router handler wraps routes in try/catch — a throwing route returns 500
  instead of hanging the request.
- SSE consumption in the app uses `URLSessionDataDelegate` (the
  `bytes.lines` API buffers `text/event-stream`), with a request timeout
  above the router's keep-alive so idle streams survive.
- `voice-sink` and the `herdr-voice` CLI read `tts.providers[0]` (dead
  `tts.provider` fallbacks removed).

## [2.0.0] — 2026-07-01

Cross-platform release with pluggable speech and summarization. See
[docs/migration-v1-v2.md](docs/migration-v1-v2.md).

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
- **Mute the focused pane** — new top-level `muteFocusedPane` (default `false`).
  When `true`, both the Stop summary and the Notification cue stay silent for
  the herdr pane that currently has focus — the session you're actively looking
  at, which you watch finish yourself — while background sessions keep speaking.
  Each hook asks herdr whether its own pane is focused (`herdr pane get`, over
  the socket API) just before speaking; it's a no-op outside herdr or when
  herdr is unreachable, so the default behavior is unchanged. See
  [docs/configuration.md](docs/configuration.md#top-level-fields).
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
- **TTS provider fallback chain** — `tts.providers` is now an ordered list; the
  speaker tries each until one produces audio, logging `tts_fallback {provider, reason, next}` on every miss (e.g. Gemini `http_429` quota), `tts_spoke` for
  the provider that succeeds after a fallback, and `tts_all_failed` if none do.
  Each provider's `speak()` now returns `{ok, reason}`. Omitting `providers`
  keeps the single `provider` (backward compatible). See
  [docs/providers.md](docs/providers.md).
- **Gemini inline `apiKey`** — the `gemini` block accepts `apiKey` directly in
  config (alongside `apiKeyEnv`, which reads from the environment); `apiKey`
  wins when both are present.

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
[2.0.0]: https://github.com/ensarkovankaya/herdr-voice/releases/tag/v2.0.0
[3.0.0]: https://github.com/ensarkovankaya/herdr-voice/releases/tag/v3.0.0

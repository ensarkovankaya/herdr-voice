# Contributing

Thanks for looking at herdr-voice. This is a small, deliberately dependency-free
project — the conventions below are what keep it that way.

## Project shape

- **Daemons + Claude hooks** (`src/**`) are **Node.js, ES modules (`.mjs`),
  stdlib only**. No `node_modules`, no build step.
- **CLI, installer, service layer, plugin actions, statusline** are **Bash**.
- Tests use the **Node stdlib test runner** (`node --test`) — also zero deps.

```
src/
  voice-router.mjs        host daemon (HTTP routing)
  voice-sink.mjs          remote daemon (HTTP + presence watcher)
  speak-summary.mjs       Stop hook   (summarize last turn → POST /speak)
  notify-cue.mjs          Notification hook (fixed cue → POST /speak)
  lib/
    config.mjs            config load + v1→v2 migration
    http.mjs              tiny POST/parse/respond helpers
    logger.mjs            rotating file logger
    presence.mjs          remote presence watcher + pure decidePresenceAction
    pane.mjs              per-pane voice-state resolution
    strings.mjs           en/tr spoken-string packs
    tts/                  speaker queue, OS player, providers (say/piper/gemini)
    summarize/            mode dispatch + heuristic/llm/command
bin/herdr-voice           per-machine service CLI
bin/lib/service.sh        launchd/systemd dispatch (svc_* functions)
test/                     one *.test.mjs per module
docs/                     architecture & reference (this guide's neighbors)
```

See [docs/architecture.md](docs/architecture.md) for how these fit together.

## Core principles

1. **Zero runtime dependencies.** Use only the Node stdlib (`node:*`,
   global `fetch`/`AbortController`, `Buffer`). If you reach for an npm package,
   reconsider — the whole point is a tiny footprint.

2. **Dependency injection for anything side-effecting.** Functions that spawn
   processes, fetch, touch the filesystem, or read the clock take those as
   injectable parameters with real defaults:

   ```js
   export function makeCommandSummarizer({ spawn = realSpawn } = {}) { … }
   export function makeGeminiProvider({ fetchImpl = globalThis.fetch } = {}) { … }
   ```

   This is non-negotiable: it is the only reason the project can be fully
   tested with no mocking framework and no network/audio/fs access.

3. **Never throw across a boundary that affects Claude.** Hooks and providers
   swallow errors (log a `WARN`, return) so a failure is silence, never a
   blocked Claude turn or a crashed daemon.

4. **Keep files focused.** One responsibility per module; split rather than grow
   a file into a kitchen sink.

## Tests

```sh
npm test          # == node --test  (runs everything in test/)
node --test test/summarizer.test.mjs    # a single file
```

Every behavioral change needs a test. Patterns to follow from existing tests:

- Inject fakes for `spawn`, `fetchImpl`, `which`, `platform`, `read`, timers —
  don't hit the real world. (`test/provider-*.test.mjs`,
  `test/summarize-*.test.mjs`, `test/player.test.mjs` are good models.)
- Pure functions (`decidePresenceAction`, `shorten`, `pickTailscaleIp`,
  `voiceEnabledForPane`, `pcmToWav`) get direct table tests.
- HTTP handlers (`makeRouter`, `makeSinkHandler`) are tested by calling the
  handler with fake req/res and asserting status + side effects.

Keep the suite green and fast (it runs in well under a second).

## Adding things

- **A TTS provider** — see the contract in
  [docs/providers.md](docs/providers.md#writing-a-new-provider): export a
  factory, register it in `src/lib/tts/index.mjs`, add a default voice in
  `platform.mjs`, write a provider test.
- **A summarizer mode** — add a `make<Mode>Summarizer` and wire it into the
  dispatch in `src/lib/summarize/index.mjs`; keep the heuristic fallback intact.
- **An OS / service backend** — extend the `svc_*` dispatch in
  `bin/lib/service.sh` and add a unit template.
- **A language pack** — add an entry to `STRINGS` in `src/lib/strings.mjs`.

## Style

- Match the surrounding code: small factory functions, terse single-line
  comments above non-obvious functions explaining the *why*, not the obvious.
- Bash: `set -euo pipefail`, quote expansions, prefer `jq` for JSON.
- Run `node --check <file>` if you're unsure a file parses.

## Commits & PRs

- Keep commits focused and messages concise (imperative mood, e.g.
  `feat(tts): add edge-tts provider`).
- Don't commit design/spec/scratch docs — `docs/superpowers/` is gitignored for
  exactly this.
- Make sure `npm test` passes before opening a PR, and describe what you changed
  and how you verified it.

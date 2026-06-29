# Troubleshooting

Start with `herdr-voice status` and the log at
`~/.herdr-voice/logs/herdr-voice.log`. Almost every problem is one of: the
daemon isn't running, voice is disabled, the provider isn't set up, or no audio
player is available.

## Quick diagnostics

```sh
# 1. Is the daemon running and what does it think its state is?
herdr-voice status
# herdr-voice: running | role=host | enabled=true | provider=say

# 2. Is the router/sink answering?
curl -fsS http://127.0.0.1:8973/health          # {"ok":true}

# 3. Is voice enabled?
jq .enabled ~/.herdr-voice/config.json           # true

# 4. Send a manual test phrase (bypasses Claude + the summarizer)
TOKEN=$(jq -r .token ~/.herdr-voice/config.json)
curl -X POST http://127.0.0.1:8973/speak \
  -H "X-Voice-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"Hello from herdr-voice"}'

# 5. Restart after any config or token change
herdr-voice restart
```

If the test phrase (step 4) speaks but Claude turns don't, the problem is in the
hooks or the summarizer, not the daemon or provider.

## No sound — walk the checklist

1. **`enabled=true`?** — `jq .enabled ~/.herdr-voice/config.json`. Turn on with
   `herdr-voice enable` (or the toggle keybind).
2. **Pane not muted?** Under herdr, per-pane state can override the global
   switch. Check the statusline indicator (🔈/🔇) or `~/.herdr-voice/panes/`.
   See [configuration.md](configuration.md) (`sessionDefault`) and the README
   Keybinds section.
3. **Daemon up?** — step 2 above. If not, see *Daemon won't start*.
4. **Provider configured/installed?** — see per-provider notes below.
5. **Audio player works?** (piper/gemini only) — confirm one of
   `afplay`/`aplay`/`paplay`/`ffplay` is on `PATH` and plays a WAV by hand.
6. **System volume / output device** — obvious, but check it, especially on a
   remote machine you're not looking at.
7. **(Remote) registered?** — on the host,
   `grep -i register ~/.herdr-voice/logs/herdr-voice.log | tail`. See
   [remote-setup.md](remote-setup.md).

## Daemon won't start

```sh
herdr-voice status      # running | stopped
herdr-voice logs        # app log (tail -f)
```

**macOS (launchd):** also check the raw service logs and that the agent loaded:

```sh
tail -f ~/.herdr-voice/logs/launchd.*.log
launchctl list dev.herdr-voice
```

**Linux (systemd --user):**

```sh
systemctl --user status dev.herdr-voice.service
journalctl --user -u dev.herdr-voice.service -e
```

**`node` not found under the service.** launchd/systemd run with a minimal
environment. The installer injects the install-time `PATH` into the unit; if
you moved `node` afterward, re-run `./install.sh` (or edit the unit's
`PATH`/`Environment`). This is also why presence reads the tailnet IP from
interfaces rather than the `tailscale` CLI.

## It speaks the *previous* turn's text

The Stop hook can fire before Claude has flushed the final assistant message to
the transcript. `readSettledFile` (`src/speak-summary.mjs`) waits for the
transcript file size to stop changing before reading, which prevents the
off-by-one. If you still see it, the transcript is being written unusually
slowly — there is nothing to configure, but it should self-correct on the next
turn.

## Hooks didn't fire

```sh
jq '.hooks.Stop, .hooks.Notification' ~/.claude/settings.json   # herdr-voice entries present?
```

The host installer adds idempotent Stop + Notification hooks. If they're
missing, re-run `./install.sh`. Hooks never throw, so a hook problem shows up as
silence, not a Claude error.

## Provider-specific

**piper:**

```sh
python3 -m piper --help                                  # piper installed?
ls ~/.herdr-voice/voices/                                # voice .onnx present?
command -v aplay paplay ffplay afplay                    # a player on PATH?
```

The configured `tts.piper.voice` must match a downloaded model in
`tts.piper.dataDir`. See [providers.md](providers.md#piper-local-neural-macos--linux-default-on-linux).

**gemini:**

```sh
echo "$GEMINI_API_KEY"     # must be NON-EMPTY in the DAEMON's environment
```

A missing key logs `gemini: env GEMINI_API_KEY not set` and stays silent. The
key must be in the service unit's environment (the installer injects it when set
at install time), not just your interactive shell. Other failures log
`gemini: HTTP <status>` or `gemini: no audio in response`.

## Summarizer (`claude` / `command`) is silent, wrong, or slow

These modes shell out to a subprocess and **fall back to the `heuristic`
silently** on any failure — so a misconfigured one sounds like "the summaries
got dumber", never an error.

```sh
# Does the hook even see `claude`? (mode = claude)
command -v claude

# Reproduce the exact call the hook makes (mode = claude, language = tr):
printf 'A long assistant reply with **markdown** and a code block.' \
  | claude -p --model haiku 'Summarize in ONE short spoken sentence in Turkish. No markdown, no emoji.'
```

- **Always the heuristic, `claude` ignored** — `claude` isn't on the hook's
  `PATH`, or it errored. The hooks run in Claude Code's environment (not the
  daemon's); set an absolute `summarize.claude.cmd` or fix `PATH`.
- **Summary in the wrong language** — set `summarize.claude.language` (e.g.
  `"tr"`). It's independent of the top-level `language` and is injected into the
  prompt. See
  [summarizer.md](summarizer.md#claude-your-logged-in-claude-zero-setup).
- **Cut off / falls back under load** — the model didn't answer within
  `timeoutMs` (default `12000` for `claude`, `8000` for `command`). Raise it, or
  keep a fast `model` (`haiku`).
- **Latency is normal** — you hear nothing until the model returns. Use
  `heuristic` if you want instant, offline speech.

A nested `claude -p` summary cannot recurse into itself: the hook stamps
`HERDR_VOICE_SUMMARIZING` on the child so the inner Claude session's own Stop
hook no-ops.

## Plugin / toggle

```sh
herdr plugin log list --plugin herdr-voice    # did the toggle action run?
herdr-voice status                            # reflects config.enabled
```

If a keybind does nothing, confirm the action id (`herdr-voice.toggle` /
`.toggle-pane`) in `~/.config/herdr/config.toml` and run
`herdr server reload-config`.

## Reading the log

Each line is one JSON object (NDJSON) — parse with `jq`:

```sh
herdr-voice logs                                                                      # tail -f the app log
jq -c 'select(.sessionId | startswith("a6aff93b"))' ~/.herdr-voice/logs/herdr-voice.log   # one Claude session
jq -c 'select(.event | test("register|forward|fallback"))' ~/.herdr-voice/logs/herdr-voice.log   # routing
```

`speak`/`forward` events carry `sessionId`/`pane` fields so you can tell which
session is talking. `WARN` lines name the failing component via `event`
(`tts_error`, `gemini_error`, `presence_failed`), with details in the fields.

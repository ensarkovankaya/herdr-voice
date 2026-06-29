# Summarizer

Claude's final message is often long and full of markdown, code, and emoji.
The summarizer condenses it into one short, speakable sentence before it
reaches a TTS provider. There are three modes, selected by
`summarize.mode` in [config.json](configuration.md#summarize--how-the-message-is-condensed).

## The fallback chain (read this first)

Speech must never break, so every mode degrades safely:

```
mode = llm | command ──► run it ──► sanitize + shorten(maxLen) ──► speak
                            │ error / timeout / empty
                            ▼
                       heuristic ──► sanitize + shorten(maxLen) ──► speak
                            │ empty result
                            ▼
                       fixed `fallback` string ("Done." / "Tamamlandı.")
```

- Output of **every** mode passes through `sanitizeForSpeech` (strip markdown,
  code, links, emoji) and `shorten(maxLen)` (trim to whole sentences, default
  240 chars).
- Any `llm`/`command` failure → `heuristic`. Empty heuristic → the language
  pack's `fallback`.
- Empty input text short-circuits straight to the fallback.

## `heuristic` (default, no external calls)

```jsonc
{ "summarize": { "mode": "heuristic", "maxLen": 240 } }
```

Strips markdown/code/emoji and keeps the leading sentence(s) up to `maxLen`. No
network, no subprocess, instant. This is the right default for most setups.

## `command` (run a subprocess)

Pipes the text through any CLI and reads its stdout as the summary. The most
useful recipe uses your existing Claude Code session — **no API key needed**:

```jsonc
{
  "summarize": {
    "mode": "command",
    "maxLen": 240,
    "command": {
      "cmd": "claude",
      "args": ["-p", "Summarize in one spoken sentence (no markdown, no emoji): ${text}"],
      "timeoutMs": 8000,
      "stdin": false
    }
  }
}
```

`command` fields:

| Field       | Meaning                                                           |
| ----------- | ----------------------------------------------------------------- |
| `cmd`       | Executable to run.                                                |
| `args`      | Argument array. Each `${text}` is replaced with the message text. |
| `stdin`     | If `true`, the text is also written to the process's stdin.       |
| `timeoutMs` | Kill the child and fall back after this many ms (default 8000).   |

The summary is the child's trimmed stdout. Empty output, a non-zero spawn, or a
timeout all fall back to the heuristic. Note the latency: a subprocess summary
adds however long the command takes before you hear anything.

## `llm` (HTTP endpoint)

Calls any HTTP LLM described entirely by config — works with Gemini,
OpenAI-compatible APIs, Ollama, etc. The request is built from templates and
the response is read by a dotted path.

```jsonc
{
  "summarize": {
    "mode": "llm",
    "maxLen": 240,
    "llm": {
      "url": "https://api.openai.com/v1/chat/completions",
      "method": "POST",
      "headers": { "authorization": "Bearer ${OPENAI_API_KEY}" },
      "promptTemplate": "Summarize in one spoken sentence, no markdown or emoji:\n\n${text}",
      "bodyTemplate": {
        "model": "gpt-4o-mini",
        "messages": [{ "role": "user", "content": "${prompt}" }]
      },
      "responsePath": "choices.0.message.content",
      "timeoutMs": 4000
    }
  }
}
```

`llm` fields:

| Field            | Meaning                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`            | Endpoint.                                                                                                                                                       |
| `method`         | HTTP method (default `POST`).                                                                                                                                   |
| `headers`        | Extra headers. Values interpolate `${ENV_VAR}` from the environment — so secrets stay out of the config file.                                                   |
| `promptTemplate` | Builds `${prompt}`; `${text}` inside it is the message. Defaults to just `${text}`.                                                                             |
| `bodyTemplate`   | JSON body. `${text}` and `${prompt}` are interpolated recursively through strings, arrays, and objects.                                                         |
| `responsePath`   | Dotted path into the JSON response (array indices allowed, e.g. `candidates.0.content.parts.0.text`). Omit to use the whole response if it is already a string. |
| `timeoutMs`      | Abort the request and fall back after this many ms (default 4000).                                                                                              |

Interpolation rules:

- `${text}` — the (raw) Claude message.
- `${prompt}` — the filled `promptTemplate`.
- `${ANYTHING_ELSE}` — looked up in `vars`, then `process.env`, else `""`.
  This is how `${OPENAI_API_KEY}` in a header resolves at request time.

A non-2xx status, a timeout, or a missing/empty/non-string value at
`responsePath` throws internally and falls back to the heuristic.

### Gemini summarize example

```jsonc
{
  "summarize": {
    "mode": "llm",
    "llm": {
      "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      "headers": { "x-goog-api-key": "${GEMINI_API_KEY}" },
      "bodyTemplate": {
        "contents": [{ "parts": [{ "text": "One spoken sentence, no markdown: ${text}" }] }]
      },
      "responsePath": "candidates.0.content.parts.0.text",
      "timeoutMs": 5000
    }
  }
}
```

## Choosing a mode

| Want                                                   | Use                     |
| ------------------------------------------------------ | ----------------------- |
| Fast, offline, zero config                             | `heuristic`             |
| Smart summaries from your logged-in Claude, no API key | `command` (`claude -p`) |
| Smart summaries from a hosted API or local model       | `llm`                   |

Tune `maxLen` to how much you want to hear; remember it caps the final string in
every mode.

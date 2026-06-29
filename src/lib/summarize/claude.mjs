import { spawnCapture } from './spawn.mjs';

// Model alias passed to `claude --model`. Aliases (haiku/sonnet/opus) always
// resolve to the latest model in that tier, so this default stays current.
const DEFAULT_MODEL = 'haiku';

// Instruction handed to Claude on the `-p` arg; the message text is piped on
// stdin (avoids argv length limits and shell escaping).
const DEFAULT_PROMPT =
  'Summarize this Claude Code assistant message in ONE short, plain spoken sentence. No markdown, no code, no emoji, no preamble — just the sentence.';

// Summarizer that asks the user's logged-in Claude CLI (`claude -p`) for a
// one-sentence summary — no API key, reuses the existing login. Model is
// configurable via cfg.summarize.claude.model (default `haiku`); cmd, prompt,
// and timeoutMs are overridable too. Rejects on failure so the dispatcher
// falls back to the heuristic.
export function makeClaudeSummarizer({ spawn } = {}) {
  return function claudeSummarize(text, cfg) {
    const c = (cfg.summarize && cfg.summarize.claude) || {};
    const args = ['-p', '--model', c.model || DEFAULT_MODEL, c.prompt || DEFAULT_PROMPT];
    return spawnCapture(c.cmd || 'claude', args, { spawn, input: text, timeoutMs: c.timeoutMs || 12000 });
  };
}

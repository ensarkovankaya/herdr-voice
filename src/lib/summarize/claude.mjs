import { spawnCapture } from './spawn.mjs';

// Model alias passed to `claude --model`. Aliases (haiku/sonnet/opus) always
// resolve to the latest model in that tier, so this default stays current.
const DEFAULT_MODEL = 'haiku';

// Language the summary is written in. Independent of the top-level `language`
// (which selects the spoken fixed strings and TTS voice) so the two can differ.
// Injected into the prompt as ${language}.
const DEFAULT_LANGUAGE = 'en';

// Instruction handed to Claude on the `-p` arg; the message text is piped on
// stdin (avoids argv length limits and shell escaping). ${language} is replaced
// with the resolved language name (e.g. "Turkish") before the call.
const DEFAULT_PROMPT =
  'Summarize this Claude Code assistant message in ONE short, plain spoken sentence in ${language}. No markdown, no code, no emoji, no preamble — just the sentence.';

// Map a BCP-47 code to its English display name ("tr" -> "Turkish"); fall back
// to the code itself for anything Intl can't name.
export function languageName(code) {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; }
  catch { return code; }
}

// `claude` prints auth errors on stdout (e.g. "Not logged in · Please run
// /login"), not always with a non-zero exit — so a captured "summary" can
// actually be the CLI asking us to log in. Never speak or cache those.
export function isCliErrorOutput(text) {
  return /not logged in|please run \/login/i.test(text || '');
}

// Summarizer that asks the user's logged-in Claude CLI (`claude -p`) for a
// one-sentence summary — no API key, reuses the existing login. model,
// language, prompt, cmd, and timeoutMs are all configurable via
// cfg.summarize.claude. Rejects on failure so the dispatcher falls back to the
// heuristic.
export function makeClaudeSummarizer({ spawn } = {}) {
  return function claudeSummarize(text, cfg) {
    const c = (cfg.summarize && cfg.summarize.claude) || {};
    const prompt = (c.prompt || DEFAULT_PROMPT)
      .replace(/\$\{language\}/g, languageName(c.language || DEFAULT_LANGUAGE));
    const args = ['-p', '--model', c.model || DEFAULT_MODEL, prompt];
    return spawnCapture(c.cmd || 'claude', args, { spawn, input: text, timeoutMs: c.timeoutMs || 12000 })
      .then((out) => {
        if (isCliErrorOutput(out)) throw new Error('cli_error');
        return out;
      });
  };
}

import { spawnCapture } from './spawn.mjs';

// Summarizer that pipes the text through an external command (e.g. `claude -p`).
// `${text}` in args is substituted, and the text is also written to stdin when
// cfg.stdin. Resolves trimmed stdout; rejects on spawn error, empty output, or
// timeout (the child is killed).
export function makeCommandSummarizer({ spawn } = {}) {
  return function commandSummarize(text, cfg) {
    const c = cfg.summarize.command || {};
    const args = (c.args || []).map((a) => a.replace(/\$\{text\}/g, text));
    return spawnCapture(c.cmd, args, { spawn, input: c.stdin ? text : null, timeoutMs: c.timeoutMs || 8000 });
  };
}

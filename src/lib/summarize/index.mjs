import { heuristicSummarize, sanitizeForSpeech, shorten } from './heuristic.mjs';

// Build the summarizer dispatcher. Routes to heuristic/llm/command/claude per
// cfg.summarize.mode, and always falls back to the heuristic on empty text, an
// unavailable mode, or any llm/command/claude failure.
export function makeSummarizer({ getLlm, getCommand, getClaude } = {}) {
  return async function summarize(text, cfg) {
    const maxLen = cfg.summarize.maxLen || 240;
    const fallback = cfg.fallback || 'Done.';
    const heuristic = () => heuristicSummarize(text, { maxLen }) || fallback;
    const mode = cfg.summarize.mode || 'heuristic';
    if (mode === 'heuristic' || !text) return heuristic();
    try {
      const fn = mode === 'llm' ? (getLlm && getLlm())
               : mode === 'command' ? (getCommand && getCommand())
               : mode === 'claude' ? (getClaude && getClaude())
               : null;
      if (!fn) return heuristic();
      const clean = shorten(sanitizeForSpeech(await fn(text, cfg)), maxLen);
      return clean || heuristic();
    } catch { return heuristic(); }
  };
}

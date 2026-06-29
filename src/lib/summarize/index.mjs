import { heuristicSummarize, sanitizeForSpeech, shorten } from './heuristic.mjs';

export function makeSummarizer({ getLlm, getCommand } = {}) {
  return async function summarize(text, cfg) {
    const maxLen = cfg.summarize.maxLen || 240;
    const fallback = cfg.fallback || 'Done.';
    const heuristic = () => heuristicSummarize(text, { maxLen }) || fallback;
    const mode = cfg.summarize.mode || 'heuristic';
    if (mode === 'heuristic' || !text) return heuristic();
    try {
      const fn = mode === 'llm' ? (getLlm && getLlm())
               : mode === 'command' ? (getCommand && getCommand())
               : null;
      if (!fn) return heuristic();
      const clean = shorten(sanitizeForSpeech(await fn(text, cfg)), maxLen);
      return clean || heuristic();
    } catch { return heuristic(); }
  };
}

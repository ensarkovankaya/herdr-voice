import { spawnCapture } from './spawn.mjs';
import { sanitizeForSpeech, shorten } from './heuristic.mjs';
import { languageName, isCliErrorOutput } from './claude.mjs';
import { extractSessionTitle, extractNewTurns } from '../transcript.mjs';
import { readSession as realReadSession, writeSession as realWriteSession } from '../session-store.mjs';

// Default instruction for the rolling recap. ${language} is replaced with the
// resolved language name before the call.
export const DEFAULT_RECAP_PROMPT =
  'Maintain a SHORT label for what a Claude Code session is working on. Given the current theme and the latest activity, output an updated label in ${language}: a noun phrase, max ~6 words, no trailing punctuation, no full sentence, no preamble. If the focus has not changed, keep the existing label.';

// Refresh the recap on the first turn (no recap yet) or once the per-session
// turn counter reaches the configured cadence. Pure, like decidePresenceAction.
export function shouldRefreshRecap({ turnsSinceRecap = 0, everyTurns = 5, hasRecap = false } = {}) {
  if (!hasRecap) return true;
  return turnsSinceRecap >= everyTurns;
}

// Join the session prefix and the body via the locale template
// (cfg.recapTemplate, default "${recap}: ${body}").
export function formatPrefix(prefix, body, cfg) {
  const tmpl = (cfg && cfg.recapTemplate) || '${recap}: ${body}';
  return tmpl.replace(/\$\{recap\}/g, prefix).replace(/\$\{body\}/g, body);
}

// Resolve the spoken prefix for a session and persist it for the cue path.
// claude mode → rolling recap (LLM every N turns); other modes → ai-title.
// Every outside-world call is injectable; nothing throws.
export function makeRecapper({
  spawn,
  readSession = realReadSession,
  writeSession = realWriteSession,
  now = () => Date.now(),
  onError,
} = {}) {
  return {
    async resolvePrefix({ sessionId, jsonl, cfg }) {
      const sum = (cfg && cfg.summarize) || {};
      const recapCfg = sum.recap || {};
      const claudeCfg = sum.claude || {};
      const updatedAt = new Date(now()).toISOString();

      // Non-claude modes (or recap disabled): free ai-title, no LLM.
      if (sum.mode !== 'claude' || !recapCfg.enabled) {
        const prefix = extractSessionTitle(jsonl);
        writeSession(sessionId, { prefix, updatedAt });
        return prefix;
      }

      const s = readSession(sessionId) || {};
      const everyTurns = recapCfg.everyTurns || 5;
      const maxLen = recapCfg.maxLen || 60;

      if (shouldRefreshRecap({ turnsSinceRecap: s.turnsSinceRecap || 0, everyTurns, hasRecap: !!s.recap })) {
        try {
          const prompt = (recapCfg.prompt || DEFAULT_RECAP_PROMPT)
            .replace(/\$\{language\}/g, languageName(claudeCfg.language || 'en'));
          const input = `CURRENT THEME: ${s.recap || '(none)'}\nLATEST ACTIVITY:\n${extractNewTurns(jsonl, s.transcriptChars || 0)}`;
          const args = ['-p', '--model', claudeCfg.model || 'haiku', prompt];
          const out = await spawnCapture(claudeCfg.cmd || 'claude', args, { spawn, input, timeoutMs: claudeCfg.timeoutMs || 12000 });
          // A CLI error line (e.g. "Not logged in · Please run /login") must
          // never become the cached recap — fall through to the prior one.
          if (isCliErrorOutput(out)) throw new Error('cli_error');
          const recap = shorten(sanitizeForSpeech(out), maxLen);
          if (!recap) throw new Error('empty');
          writeSession(sessionId, { recap, prefix: recap, turnsSinceRecap: 0, transcriptChars: jsonl.length, updatedAt });
          return recap;
        } catch (e) {
          onError?.(e);
          // Keep the prior recap (or ai-title if none); reset the counter so we
          // retry in N turns, not every turn (token guard).
          const prefix = s.recap || extractSessionTitle(jsonl);
          writeSession(sessionId, { ...s, prefix, turnsSinceRecap: 0, updatedAt });
          return prefix;
        }
      }

      // Not due: reuse the cached recap, bump the counter.
      const prefix = s.recap || '';
      writeSession(sessionId, { ...s, prefix, turnsSinceRecap: (s.turnsSinceRecap || 0) + 1, updatedAt });
      return prefix;
    },
  };
}

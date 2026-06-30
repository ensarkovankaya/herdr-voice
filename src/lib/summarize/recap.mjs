import { spawnCapture } from './spawn.mjs';
import { sanitizeForSpeech, shorten } from './heuristic.mjs';
import { languageName } from './claude.mjs';
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

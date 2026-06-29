import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeForSpeech, shorten, heuristicSummarize } from '../src/lib/summarize/heuristic.mjs';

test('sanitizeForSpeech strips code/markdown/emoji', () => {
  assert.equal(sanitizeForSpeech('**Hi** `x` 🎉 done'), 'Hi done');
  assert.equal(sanitizeForSpeech('```\ncode\n``` after'), 'after');
});
test('shorten: keeps whole sentences under maxLen', () => {
  assert.equal(shorten('One. Two. Three.', 9), 'One.');
});
test('shorten: hard cap with ellipsis', () => {
  const out = shorten('a'.repeat(50), 10);
  assert.equal(out.length, 10);
  assert.ok(out.endsWith('…'));
});
test('heuristicSummarize: sanitize then shorten', () => {
  assert.equal(heuristicSummarize('**Done.** Extra stuff here.', { maxLen: 6 }), 'Done.');
});

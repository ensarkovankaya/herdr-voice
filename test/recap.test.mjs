import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRefreshRecap } from '../src/lib/summarize/recap.mjs';

test('shouldRefreshRecap: first time (no recap yet) → true', () => {
  assert.equal(shouldRefreshRecap({ turnsSinceRecap: 0, everyTurns: 5, hasRecap: false }), true);
});
test('shouldRefreshRecap: below cadence with recap → false', () => {
  assert.equal(shouldRefreshRecap({ turnsSinceRecap: 4, everyTurns: 5, hasRecap: true }), false);
});
test('shouldRefreshRecap: at/over cadence → true', () => {
  assert.equal(shouldRefreshRecap({ turnsSinceRecap: 5, everyTurns: 5, hasRecap: true }), true);
  assert.equal(shouldRefreshRecap({ turnsSinceRecap: 9, everyTurns: 5, hasRecap: true }), true);
});

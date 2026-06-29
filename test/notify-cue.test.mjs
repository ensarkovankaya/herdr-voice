import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cueFor } from '../src/notify-cue.mjs';

test('idle_prompt → cueIdle; permission_prompt and other types → cue', () => {
  const cfg = { cue: 'Approval needed.', cueIdle: 'Waiting for you.' };
  assert.equal(cueFor({ notification_type: 'idle_prompt' }, cfg), 'Waiting for you.');
  assert.equal(cueFor({ notification_type: 'permission_prompt', message: 'Bash: npm test' }, cfg), 'Approval needed.');
  assert.equal(cueFor({ notification_type: 'auth_success' }, cfg), 'Approval needed.');
  assert.equal(cueFor({}, cfg), 'Approval needed.');
});

test('idle falls back to cue when cueIdle is unset', () => {
  assert.equal(cueFor({ notification_type: 'idle_prompt' }, { cue: 'Approval needed.' }), 'Approval needed.');
});

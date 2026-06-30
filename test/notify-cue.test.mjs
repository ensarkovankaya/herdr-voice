import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cueFor, cueText } from '../src/notify-cue.mjs';

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

test('cueText: prepends cached prefix to the cue', () => {
  const cfg = { cue: 'Approval needed.', cueIdle: 'Waiting for you.' };
  const rs = () => ({ prefix: 'Search app release' });
  assert.equal(cueText({ notification_type: 'permission_prompt', session_id: 's' }, cfg, { readSession: rs }),
    'Search app release: Approval needed.');
  assert.equal(cueText({ notification_type: 'idle_prompt', session_id: 's' }, cfg, { readSession: rs }),
    'Search app release: Waiting for you.');
});

test('cueText: no cached prefix → bare cue', () => {
  const cfg = { cue: 'Approval needed.' };
  assert.equal(cueText({ session_id: 's' }, cfg, { readSession: () => ({}) }), 'Approval needed.');
  assert.equal(cueText({}, cfg, { readSession: () => ({ prefix: 'X' }) }), 'Approval needed.'); // no session_id
});

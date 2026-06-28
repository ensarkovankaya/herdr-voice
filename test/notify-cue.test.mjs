import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cueFor } from '../src/notify-cue.mjs';

test('returns the fixed cue from config', () => {
  assert.equal(cueFor({ notification_type: 'permission_prompt', message: 'Bash: npm test' }, { cue: 'Approval needed.' }), 'Approval needed.');
});

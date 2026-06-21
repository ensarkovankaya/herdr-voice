import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cueFor } from '../src/notify-cue.mjs';

test('v1: konfigdeki sabit cue döner', () => {
  assert.equal(cueFor({ notification_type: 'permission_prompt', message: 'Bash: npm test' }, { cue: 'Onayın gerekiyor.' }), 'Onayın gerekiyor.');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProvider, defaultVoice } from '../src/lib/tts/platform.mjs';

test('defaultProvider', () => {
  assert.equal(defaultProvider('darwin'), 'say');
  assert.equal(defaultProvider('linux'), 'piper');
});
test('defaultVoice', () => {
  assert.equal(defaultVoice('say'), 'Samantha');
  assert.equal(defaultVoice('piper'), 'en_US-lessac-medium');
  assert.equal(defaultVoice('gemini'), 'Kore');
});

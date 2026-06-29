import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makeSpeaker } from '../src/lib/tts/index.mjs';

test('speaker drives say provider end-to-end (injected spawn)', async () => {
  const calls = [];
  const spawn = (bin, args) => { calls.push([bin, args]); const e = new EventEmitter(); setImmediate(() => e.emit('close')); return e; };
  const provider = (await import('../src/lib/tts/providers/say.mjs')).makeSayProvider({ spawn });
  const speak = makeSpeaker({ getConfig: () => ({ tts: { provider: 'say', say: { voice: 'Samantha' } }, audio: {} }), makeProvider: async () => provider, player: async () => {} });
  await speak('hi');
  assert.deepEqual(calls, [['say', ['-v', 'Samantha', 'hi']]]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makeSayProvider } from '../src/lib/tts/providers/say.mjs';

test('say: spawns `say -v <voice> <text>`', async () => {
  const calls = [];
  const spawn = (bin, args) => { calls.push([bin, args]); const e = new EventEmitter(); setImmediate(() => e.emit('close')); return e; };
  const p = makeSayProvider({ spawn });
  await p.speak('hello', { cfg: { tts: { say: { voice: 'Samantha' } } } });
  assert.deepEqual(calls, [['say', ['-v', 'Samantha', 'hello']]]);
});

test('say: spawn throw resolves quietly', async () => {
  const p = makeSayProvider({ spawn: () => { throw new Error('nope'); } });
  await p.speak('hi', { cfg: { tts: { say: { voice: 'X' } } } });
});

test('say: ignores injected player (self-playing)', async () => {
  const calls = [];
  const spawn = (bin, args) => { calls.push([bin, args]); const e = new EventEmitter(); setImmediate(() => e.emit('close')); return e; };
  let playerCalled = false;
  const p = makeSayProvider({ spawn });
  await p.speak('hi', { cfg: { tts: { say: { voice: 'Samantha' } } }, player: async () => { playerCalled = true; } });
  assert.equal(playerCalled, false);
  assert.equal(calls.length, 1);
});

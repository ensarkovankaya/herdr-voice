import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makeSayProvider } from '../src/lib/tts/providers/say.mjs';

test('say: spawns `say -v <voice> <text>` and reports ok', async () => {
  const calls = [];
  const spawn = (bin, args) => { calls.push([bin, args]); const e = new EventEmitter(); setImmediate(() => e.emit('close', 0)); return e; };
  const p = makeSayProvider({ spawn });
  const r = await p.speak('hello', { cfg: { tts: { say: { voice: 'Samantha' } } } });
  assert.deepEqual(calls, [['say', ['-v', 'Samantha', 'hello']]]);
  assert.deepEqual(r, { ok: true });
});

test('say: nonzero exit -> ok:false with reason', async () => {
  const spawn = () => { const e = new EventEmitter(); setImmediate(() => e.emit('close', 1)); return e; };
  const p = makeSayProvider({ spawn });
  const r = await p.speak('hi', { cfg: { tts: { say: { voice: 'X' } } } });
  assert.deepEqual(r, { ok: false, reason: 'exit_1' });
});

test('say: spawn throw -> ok:false spawn_failed', async () => {
  const p = makeSayProvider({ spawn: () => { throw new Error('nope'); } });
  const r = await p.speak('hi', { cfg: { tts: { say: { voice: 'X' } } } });
  assert.deepEqual(r, { ok: false, reason: 'spawn_failed' });
});

test('say: ignores injected player (self-playing)', async () => {
  const calls = [];
  const spawn = (bin, args) => { calls.push([bin, args]); const e = new EventEmitter(); setImmediate(() => e.emit('close', 0)); return e; };
  let playerCalled = false;
  const p = makeSayProvider({ spawn });
  await p.speak('hi', { cfg: { tts: { say: { voice: 'Samantha' } } }, player: async () => { playerCalled = true; } });
  assert.equal(playerCalled, false);
  assert.equal(calls.length, 1);
});

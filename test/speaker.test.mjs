import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSpeaker } from '../src/lib/tts/index.mjs';

const cfg = { tts: { provider: 'say', say: { voice: 'Samantha' } }, audio: { player: 'auto' } };

test('speaker: dispatches to provider with text + ctx', async () => {
  const seen = [];
  const provider = { name: 'say', speak: async (t, ctx) => seen.push([t, !!ctx.player, ctx.cfg.tts.provider]) };
  const speak = makeSpeaker({ getConfig: () => cfg, makeProvider: async () => provider, player: async () => {} });
  await speak('hello');
  assert.deepEqual(seen, [['hello', true, 'say']]);
});

test('speaker: empty text is a no-op', async () => {
  let called = false;
  const speak = makeSpeaker({ getConfig: () => cfg, makeProvider: async () => ({ speak: async () => { called = true; } }), player: async () => {} });
  await speak('   ');
  assert.equal(called, false);
});

test('speaker: serializes calls', async () => {
  const order = [];
  const provider = { speak: (t) => new Promise((r) => setTimeout(() => { order.push(t); r(); }, t === 'a' ? 20 : 1)) };
  const speak = makeSpeaker({ getConfig: () => cfg, makeProvider: async () => provider, player: async () => {} });
  speak('a'); await speak('b');
  assert.deepEqual(order, ['a', 'b']);
});

test('speaker: provider error is swallowed', async () => {
  const speak = makeSpeaker({ getConfig: () => cfg, makeProvider: async () => ({ speak: async () => { throw new Error('boom'); } }), player: async () => {}, log: () => {} });
  await speak('x'); // must not throw
});

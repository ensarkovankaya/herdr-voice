import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSpeaker } from '../src/lib/tts/index.mjs';

const cfg = { tts: { providers: ['say'], say: { voice: 'Samantha' } }, audio: { player: 'auto' } };

test('speaker: dispatches to provider with text + ctx', async () => {
  const seen = [];
  const provider = { name: 'say', speak: async (t, ctx) => { seen.push([t, !!ctx.player, ctx.cfg.tts.providers[0]]); return { ok: true }; } };
  const speak = makeSpeaker({ getConfig: () => cfg, makeProvider: async () => provider, player: async () => {} });
  await speak('hello');
  assert.deepEqual(seen, [['hello', true, 'say']]);
});

test('speaker: empty text is a no-op', async () => {
  let called = false;
  const speak = makeSpeaker({ getConfig: () => cfg, makeProvider: async () => ({ speak: async () => { called = true; return { ok: true }; } }), player: async () => {} });
  await speak('   ');
  assert.equal(called, false);
});

test('speaker: serializes calls', async () => {
  const order = [];
  const provider = { speak: (t) => new Promise((r) => setTimeout(() => { order.push(t); r({ ok: true }); }, t === 'a' ? 20 : 1)) };
  const speak = makeSpeaker({ getConfig: () => cfg, makeProvider: async () => provider, player: async () => {} });
  speak('a'); await speak('b');
  assert.deepEqual(order, ['a', 'b']);
});

test('speaker: provider throw is swallowed', async () => {
  const speak = makeSpeaker({ getConfig: () => cfg, makeProvider: async () => ({ speak: async () => { throw new Error('boom'); } }), player: async () => {}, log: () => {} });
  await speak('x'); // must not throw
});

// --- fallback chain ---
const cfgChain = { tts: { providers: ['gemini', 'piper', 'say'], gemini: {}, piper: {}, say: {} }, audio: {} };

test('speaker: falls back to the next provider when one fails', async () => {
  const calls = [];
  const provs = {
    gemini: { speak: async () => { calls.push('gemini'); return { ok: false, reason: 'http_429' }; } },
    piper: { speak: async () => { calls.push('piper'); return { ok: true }; } },
    say: { speak: async () => { calls.push('say'); return { ok: true }; } },
  };
  const logs = [];
  const speak = makeSpeaker({ getConfig: () => cfgChain, makeProvider: async (n) => provs[n], player: async () => {}, log: (l, e, f) => logs.push({ e, ...f }) });
  await speak('hi');
  assert.deepEqual(calls, ['gemini', 'piper']); // stops at first ok; say untried
  assert.ok(logs.find((x) => x.e === 'tts_fallback' && x.provider === 'gemini' && x.reason === 'http_429' && x.next === 'piper'));
  assert.ok(logs.find((x) => x.e === 'tts_spoke' && x.provider === 'piper'));
});

test('speaker: logs tts_all_failed when every provider fails', async () => {
  const provs = {
    gemini: { speak: async () => ({ ok: false, reason: 'no_key' }) },
    piper: { speak: async () => ({ ok: false, reason: 'spawn_failed' }) },
    say: { speak: async () => ({ ok: false, reason: 'exit_1' }) },
  };
  const logs = [];
  const speak = makeSpeaker({ getConfig: () => cfgChain, makeProvider: async (n) => provs[n], player: async () => {}, log: (l, e, f) => logs.push({ e, ...f }) });
  await speak('hi');
  const all = logs.find((x) => x.e === 'tts_all_failed');
  assert.ok(all);
  assert.deepEqual(all.providers, ['gemini', 'piper', 'say']);
});

test('speaker: single-entry providers list — backward compatible', async () => {
  const calls = [];
  const speak = makeSpeaker({ getConfig: () => cfg, makeProvider: async (n) => ({ speak: async () => { calls.push(n); return { ok: true }; } }), player: async () => {}, log: () => {} });
  await speak('hi');
  assert.deepEqual(calls, ['say']); // cfg.tts.providers=['say']
});

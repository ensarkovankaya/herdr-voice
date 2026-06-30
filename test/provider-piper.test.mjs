import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makePiperProvider } from '../src/lib/tts/providers/piper.mjs';

const cfg = { tts: { piper: { cmd: 'python3 -m piper', voice: 'en_US-lessac-medium', dataDir: '/voices' } } };

test('piper: spawns python -m piper with -f tmp.wav, plays it, ok:true', async () => {
  const calls = [];
  const played = [];
  const spawn = (bin, args) => { calls.push([bin, args]); const e = new EventEmitter(); setImmediate(() => e.emit('close', 0)); return e; };
  const p = makePiperProvider({ spawn, mkdtemp: () => '/tmp/hv-x', rm: () => {} });
  const r = await p.speak('hi there', { cfg, player: async (f) => played.push(f) });
  assert.equal(calls[0][0], 'python3');
  assert.deepEqual(calls[0][1], ['-m', 'piper', '-m', 'en_US-lessac-medium', '--data-dir', '/voices', '-f', '/tmp/hv-x/out.wav', '--', 'hi there']);
  assert.deepEqual(played, ['/tmp/hv-x/out.wav']);
  assert.deepEqual(r, { ok: true });
});

test('piper: synth nonzero exit -> ok:false, no playback', async () => {
  const played = [];
  const spawn = () => { const e = new EventEmitter(); setImmediate(() => e.emit('close', 2)); return e; };
  const p = makePiperProvider({ spawn, mkdtemp: () => '/tmp/hv-x', rm: () => {} });
  const r = await p.speak('hi', { cfg, player: async (f) => played.push(f) });
  assert.deepEqual(r, { ok: false, reason: 'exit_2' });
  assert.equal(played.length, 0);
});

test('piper: spawn throw -> ok:false spawn_failed', async () => {
  const p = makePiperProvider({ spawn: () => { throw new Error('nope'); }, mkdtemp: () => '/tmp/hv-x', rm: () => {} });
  const r = await p.speak('hi', { cfg, player: async () => {} });
  assert.deepEqual(r, { ok: false, reason: 'spawn_failed' });
});

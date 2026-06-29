import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makePiperProvider } from '../src/lib/tts/providers/piper.mjs';

test('piper: spawns python -m piper with -f tmp.wav then plays it', async () => {
  const calls = [];
  const played = [];
  const spawn = (bin, args) => { calls.push([bin, args]); const e = new EventEmitter(); setImmediate(() => e.emit('close')); return e; };
  const p = makePiperProvider({ spawn, mkdtemp: () => '/tmp/hv-x', rm: () => {} });
  const cfg = { tts: { piper: { cmd: 'python3 -m piper', voice: 'en_US-lessac-medium', dataDir: '/voices' } } };
  await p.speak('hi there', { cfg, player: async (f) => played.push(f) });
  assert.equal(calls[0][0], 'python3');
  assert.deepEqual(calls[0][1], ['-m', 'piper', '-m', 'en_US-lessac-medium', '--data-dir', '/voices', '-f', '/tmp/hv-x/out.wav', '--', 'hi there']);
  assert.deepEqual(played, ['/tmp/hv-x/out.wav']);
});

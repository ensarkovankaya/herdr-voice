import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makePlayer, resolvePlayer } from '../src/lib/tts/player.mjs';

test('resolvePlayer: darwin -> afplay', () => {
  const [bin, args] = resolvePlayer({ platform: 'darwin', which: () => true, audio: {} }, '/x.wav');
  assert.equal(bin, 'afplay');
  assert.deepEqual(args, ['/x.wav']);
});

test('resolvePlayer: linux picks first available', () => {
  const [bin] = resolvePlayer({ platform: 'linux', which: (b) => b === 'aplay', audio: {} }, '/x.wav');
  assert.equal(bin, 'aplay');
});

test('resolvePlayer: explicit template', () => {
  const [bin, args] = resolvePlayer({ platform: 'linux', which: () => true, audio: { player: 'mpv --no-video ${file}' } }, '/x.wav');
  assert.equal(bin, 'mpv');
  assert.deepEqual(args, ['--no-video', '/x.wav']);
});

test('resolvePlayer: nothing available -> [null,[]]', () => {
  const r = resolvePlayer({ platform: 'linux', which: () => false, audio: {} }, '/x.wav');
  assert.equal(r[0], null);
});

test('play: spawns resolved player and resolves on close', async () => {
  const calls = [];
  const fakeSpawn = (bin, args) => { calls.push([bin, args]); const e = new EventEmitter(); setImmediate(() => e.emit('close')); return e; };
  const play = makePlayer({ platform: 'darwin', spawn: fakeSpawn, which: () => true, audio: {} });
  await play('/tmp/a.wav');
  assert.deepEqual(calls, [['afplay', ['/tmp/a.wav']]]);
});

test('play: no player available resolves quietly', async () => {
  const play = makePlayer({ platform: 'linux', spawn: () => { throw new Error('should not spawn'); }, which: () => false, audio: {} });
  await play('/tmp/a.wav'); // must not throw
});

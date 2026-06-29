import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pcmToWav } from '../src/lib/tts/wav.mjs';

test('pcmToWav: header + data length', () => {
  const pcm = Buffer.alloc(100, 1);
  const wav = pcmToWav(pcm, { sampleRate: 24000, channels: 1, bitDepth: 16 });
  assert.equal(wav.length, 44 + 100);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.toString('ascii', 12, 16), 'fmt ');
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  assert.equal(wav.readUInt16LE(20), 1);       // PCM
  assert.equal(wav.readUInt16LE(22), 1);       // channels
  assert.equal(wav.readUInt32LE(24), 24000);   // sample rate
  assert.equal(wav.readUInt16LE(34), 16);      // bit depth
  assert.equal(wav.readUInt32LE(40), 100);     // data size
});

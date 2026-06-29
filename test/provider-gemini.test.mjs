import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGeminiProvider } from '../src/lib/tts/providers/gemini.mjs';

const baseCfg = { tts: { gemini: { model: 'gemini-2.5-flash-preview-tts', voice: 'Kore', apiKeyEnv: 'HV_TEST_KEY', languageCode: '' } } };

test('gemini: posts correct request, wraps PCM, plays', async () => {
  process.env.HV_TEST_KEY = 'secret';
  let captured;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('abc').toString('base64') } }] } }] }) };
  };
  const written = []; const played = [];
  const p = makeGeminiProvider({ fetchImpl, writeFile: (f, b) => written.push([f, b.length]), mkdtemp: () => '/tmp/hv-g', rm: () => {} });
  await p.speak('hello', { cfg: baseCfg, player: async (f) => played.push(f), log: () => {} });
  assert.match(captured.url, /models\/gemini-2\.5-flash-preview-tts:generateContent$/);
  assert.equal(captured.opts.headers['x-goog-api-key'], 'secret');
  const body = JSON.parse(captured.opts.body);
  assert.deepEqual(body.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');
  assert.equal(written[0][1], 44 + 3); // wav header + 'abc'
  assert.deepEqual(played, ['/tmp/hv-g/out.wav']);
  delete process.env.HV_TEST_KEY;
});

test('gemini: missing key -> no fetch, no play', async () => {
  delete process.env.HV_TEST_KEY;
  let fetched = false;
  const p = makeGeminiProvider({ fetchImpl: async () => { fetched = true; return { ok: true, json: async () => ({}) }; }, writeFile: () => {}, mkdtemp: () => '/tmp/x', rm: () => {} });
  const played = [];
  await p.speak('hi', { cfg: baseCfg, player: async (f) => played.push(f), log: () => {} });
  assert.equal(fetched, false);
  assert.equal(played.length, 0);
});

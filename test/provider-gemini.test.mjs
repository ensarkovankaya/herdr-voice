import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGeminiProvider } from '../src/lib/tts/providers/gemini.mjs';

const baseCfg = { tts: { gemini: { model: 'gemini-2.5-flash-preview-tts', voice: 'Kore', apiKeyEnv: 'HV_TEST_KEY', languageCode: '' } } };

test('gemini: posts correct request, wraps PCM, plays, ok:true', async () => {
  process.env.HV_TEST_KEY = 'secret';
  let captured;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('abc').toString('base64') } }] } }] }) };
  };
  const written = []; const played = [];
  const p = makeGeminiProvider({ fetchImpl, writeFile: (f, b) => written.push([f, b.length]), mkdtemp: () => '/tmp/hv-g', rm: () => {} });
  const r = await p.speak('hello', { cfg: baseCfg, player: async (f) => played.push(f) });
  assert.match(captured.url, /models\/gemini-2\.5-flash-preview-tts:generateContent$/);
  assert.equal(captured.opts.headers['x-goog-api-key'], 'secret');
  const body = JSON.parse(captured.opts.body);
  assert.deepEqual(body.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');
  assert.equal(written[0][1], 44 + 3); // wav header + 'abc'
  assert.deepEqual(played, ['/tmp/hv-g/out.wav']);
  assert.deepEqual(r, { ok: true });
  delete process.env.HV_TEST_KEY;
});

test('gemini: inline apiKey from config is used directly (no env needed)', async () => {
  const cfg = { tts: { gemini: { model: 'gemini-2.5-flash-preview-tts', voice: 'Kore', apiKey: 'inline-key', languageCode: 'tr-TR' } } };
  let captured;
  const fetchImpl = async (url, opts) => {
    captured = opts;
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('x').toString('base64') } }] } }] }) };
  };
  const p = makeGeminiProvider({ fetchImpl, writeFile: () => {}, mkdtemp: () => '/tmp/hv-g', rm: () => {} });
  const r = await p.speak('hi', { cfg, player: async () => {} });
  assert.ok(captured, 'fetch should be called using the inline apiKey');
  assert.equal(captured.headers['x-goog-api-key'], 'inline-key');
  assert.deepEqual(r, { ok: true });
});

test('gemini: missing key -> no fetch, ok:false no_key', async () => {
  delete process.env.HV_TEST_KEY;
  let fetched = false;
  const p = makeGeminiProvider({ fetchImpl: async () => { fetched = true; return { ok: true, json: async () => ({}) }; }, writeFile: () => {}, mkdtemp: () => '/tmp/x', rm: () => {} });
  const played = [];
  const r = await p.speak('hi', { cfg: baseCfg, player: async (f) => played.push(f) });
  assert.equal(fetched, false);
  assert.equal(played.length, 0);
  assert.deepEqual(r, { ok: false, reason: 'no_key' });
});

test('gemini: HTTP error (e.g. 429 quota) -> ok:false http_<status>', async () => {
  process.env.HV_TEST_KEY = 'secret';
  let played = 0;
  const p = makeGeminiProvider({ fetchImpl: async () => ({ ok: false, status: 429 }), writeFile: () => {}, mkdtemp: () => '/tmp/x', rm: () => {} });
  const r = await p.speak('hi', { cfg: baseCfg, player: async () => { played++; } });
  assert.deepEqual(r, { ok: false, reason: 'http_429' });
  assert.equal(played, 0);
  delete process.env.HV_TEST_KEY;
});

test('gemini: 200 but no audio data -> ok:false no_audio', async () => {
  process.env.HV_TEST_KEY = 'secret';
  const p = makeGeminiProvider({ fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'oops' }] } }] }) }), writeFile: () => {}, mkdtemp: () => '/tmp/x', rm: () => {} });
  const r = await p.speak('hi', { cfg: baseCfg, player: async () => {} });
  assert.deepEqual(r, { ok: false, reason: 'no_audio' });
  delete process.env.HV_TEST_KEY;
});

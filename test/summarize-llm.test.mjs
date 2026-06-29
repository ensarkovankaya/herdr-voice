import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLlmSummarizer } from '../src/lib/summarize/llm.mjs';

const cfg = (llm) => ({ summarize: { llm } });

test('llm: interpolates prompt/body, reads responsePath', async () => {
  let captured;
  const fetchImpl = async (url, opts) => { captured = { url, opts }; return { ok: true, json: async () => ({ out: { text: 'short summary' } }) }; };
  const fn = makeLlmSummarizer({ fetchImpl });
  const r = await fn('LONG TEXT', cfg({
    url: 'http://x/api', method: 'POST',
    headers: { 'x-key': '${HV_K}' },
    promptTemplate: 'Sum: ${text}',
    bodyTemplate: { prompt: '${prompt}' },
    responsePath: 'out.text', timeoutMs: 1000,
  }));
  assert.equal(r, 'short summary');
  assert.equal(JSON.parse(captured.opts.body).prompt, 'Sum: LONG TEXT');
});

test('llm: HTTP error throws', async () => {
  const fn = makeLlmSummarizer({ fetchImpl: async () => ({ ok: false, status: 500 }) });
  await assert.rejects(fn('x', cfg({ url: 'http://x', responsePath: 'a', timeoutMs: 100 })));
});

test('llm: empty result throws', async () => {
  const fn = makeLlmSummarizer({ fetchImpl: async () => ({ ok: true, json: async () => ({ a: '' }) }) });
  await assert.rejects(fn('x', cfg({ url: 'http://x', responsePath: 'a', timeoutMs: 100 })));
});

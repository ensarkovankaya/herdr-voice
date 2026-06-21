import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { postJson, readJsonBody, sendJson } from '../src/lib/http.mjs';

function listen(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => resolve({ s, port: s.address().port }));
  });
}

test('postJson gönderir, readJsonBody/sendJson okur+yazar, token header geçer', async () => {
  let seen;
  const { s, port } = await listen(async (req, res) => {
    seen = { token: req.headers['x-voice-token'], body: await readJsonBody(req) };
    sendJson(res, 202, { ok: true });
  });
  const r = await postJson(`http://127.0.0.1:${port}/speak`, { text: 'merhaba' }, { token: 't1' });
  assert.equal(r.status, 202);
  assert.equal(seen.token, 't1');
  assert.deepEqual(seen.body, { text: 'merhaba' });
  s.close();
});

test('postJson timeout reddeder', async () => {
  const { s, port } = await listen(() => { /* asla cevap verme */ });
  await assert.rejects(postJson(`http://127.0.0.1:${port}/x`, {}, { timeoutMs: 100 }));
  s.close();
});

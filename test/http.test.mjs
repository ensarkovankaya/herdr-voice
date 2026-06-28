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

test('postJson sends, readJsonBody/sendJson read+write, token header passes through', async () => {
  let seen;
  const { s, port } = await listen(async (req, res) => {
    seen = { token: req.headers['x-voice-token'], body: await readJsonBody(req) };
    sendJson(res, 202, { ok: true });
  });
  const r = await postJson(`http://127.0.0.1:${port}/speak`, { text: 'hello' }, { token: 't1' });
  assert.equal(r.status, 202);
  assert.equal(seen.token, 't1');
  assert.deepEqual(seen.body, { text: 'hello' });
  s.close();
});

test('postJson rejects on timeout', async () => {
  const { s, port } = await listen(() => { /* never respond */ });
  await assert.rejects(postJson(`http://127.0.0.1:${port}/x`, {}, { timeoutMs: 100 }));
  s.close();
});

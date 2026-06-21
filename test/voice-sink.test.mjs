import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { makeSinkHandler } from '../src/voice-sink.mjs';
import { postJson } from '../src/lib/http.mjs';

function start(handler) {
  return new Promise((res) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => res({ s, port: s.address().port }));
  });
}

test('doğru token → 202 ve speak çağrılır', async () => {
  const spoken = [];
  const { s, port } = await start(makeSinkHandler({ token: 'T', voice: 'Yelda', speak: (t) => spoken.push(t) }));
  const r = await postJson(`http://127.0.0.1:${port}/speak`, { text: 'selam' }, { token: 'T' });
  assert.equal(r.status, 202);
  assert.deepEqual(spoken, ['selam']);
  s.close();
});

test('yanlış token → 401, speak çağrılmaz', async () => {
  const spoken = [];
  const { s, port } = await start(makeSinkHandler({ token: 'T', voice: 'Yelda', speak: (t) => spoken.push(t) }));
  const r = await postJson(`http://127.0.0.1:${port}/speak`, { text: 'x' }, { token: 'WRONG' });
  assert.equal(r.status, 401);
  assert.equal(spoken.length, 0);
  s.close();
});

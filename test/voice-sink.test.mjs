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
const noLog = () => {};

test('valid token + enabled → 202 and speak with fresh voice', async () => {
  const spoken = [];
  const getConfig = () => ({ token: 'T', voice: 'Alex', enabled: true });
  const { s, port } = await start(makeSinkHandler({ getConfig, speak: (t, o) => spoken.push([t, o.voice]), log: noLog }));
  const r = await postJson(`http://127.0.0.1:${port}/speak`, { text: 'hello' }, { token: 'T' });
  assert.equal(r.status, 202);
  assert.deepEqual(spoken, [['hello', 'Alex']]);
  s.close();
});

test('enabled=false → speak is not called', async () => {
  const spoken = [];
  const getConfig = () => ({ token: 'T', voice: 'Samantha', enabled: false });
  const { s, port } = await start(makeSinkHandler({ getConfig, speak: (t) => spoken.push(t), log: noLog }));
  const r = await postJson(`http://127.0.0.1:${port}/speak`, { text: 'x' }, { token: 'T' });
  assert.equal(r.status, 200);
  assert.equal(spoken.length, 0);
  s.close();
});

test('wrong token → 401', async () => {
  const getConfig = () => ({ token: 'T', voice: 'Samantha', enabled: true });
  const { s, port } = await start(makeSinkHandler({ getConfig, speak: () => {}, log: noLog }));
  const r = await postJson(`http://127.0.0.1:${port}/speak`, { text: 'x' }, { token: 'WRONG' });
  assert.equal(r.status, 401);
  s.close();
});

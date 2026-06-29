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

test('valid token + enabled → 202 and speak called', async () => {
  const spoken = [];
  const getConfig = () => ({ token: 'T', enabled: true });
  const { s, port } = await start(makeSinkHandler({ getConfig, speak: (t) => spoken.push(t), log: noLog }));
  const r = await postJson(`http://127.0.0.1:${port}/speak`, { text: 'hello' }, { token: 'T' });
  assert.equal(r.status, 202);
  assert.deepEqual(spoken, ['hello']);
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

test('SPEAK log carries session/pane tag', async () => {
  const logs = [];
  const getConfig = () => ({ token: 'T', voice: 'Samantha', enabled: true });
  const { s, port } = await start(makeSinkHandler({ getConfig, speak: () => {}, log: (lvl, msg) => logs.push(msg) }));
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'hi', sessionId: 'abcd1234ef', pane: 'w1:p4' }, { token: 'T' });
  assert.ok(logs.some((m) => /SPEAK \[sess:abcd1234 pane:w1:p4\]/.test(m)), logs.join(' | '));
  s.close();
});

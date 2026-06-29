import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { makeRouter } from '../src/voice-router.mjs';
import { postJson } from '../src/lib/http.mjs';

function start(handler) {
  return new Promise((res) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => res({ s, port: s.address().port }));
  });
}
const flush = () => new Promise((r) => setImmediate(r));
const noLog = () => {};
const cfgOf = (over = {}) => () => ({ token: 'T', voice: 'Samantha', remoteTtlMs: 1000, ...over });

test('no remote → local speak', async () => {
  const spoken = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ voice: 'Alex' }), speak: (t) => spoken.push(t),
    forward: () => Promise.resolve(), now: () => 0, log: noLog }));
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'local' }, { token: 'T' });
  await flush();
  assert.deepEqual(spoken, ['local']);
  s.close();
});

test('register → forward; no local', async () => {
  const spoken = [], fwd = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: (t) => spoken.push(t),
    forward: (ip, p, t) => { fwd.push([ip, p, t]); return Promise.resolve(); }, now: () => 0, log: noLog }));
  await postJson(`http://127.0.0.1:${port}/register`, { ip: '1.2.3.4' }, { token: 'T' });
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'remote' }, { token: 'T' });
  await flush();
  assert.deepEqual(fwd, [['1.2.3.4', 8973, 'remote']]);
  assert.equal(spoken.length, 0);
  s.close();
});

test('forward error → registration cleared + local fallback', async () => {
  const spoken = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: (t) => spoken.push(t),
    forward: () => Promise.reject(new Error('down')), now: () => 0, log: noLog }));
  await postJson(`http://127.0.0.1:${port}/register`, { ip: '1.2.3.4' }, { token: 'T' });
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'a' }, { token: 'T' });
  await flush(); await flush();
  assert.deepEqual(spoken, ['a']);
  s.close();
});

test('expired registration → local', async () => {
  const spoken = []; let t = 0;
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ remoteTtlMs: 100 }), speak: (x) => spoken.push(x),
    forward: () => Promise.resolve(), now: () => t, log: noLog }));
  await postJson(`http://127.0.0.1:${port}/register`, { ip: '1.2.3.4' }, { token: 'T' });
  t = 1000;
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'c' }, { token: 'T' });
  await flush();
  assert.deepEqual(spoken, ['c']);
  s.close();
});

test('wrong token → 401', async () => {
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: () => {}, forward: () => Promise.resolve(), now: () => 0, log: noLog }));
  const r = await postJson(`http://127.0.0.1:${port}/speak`, { text: 'x' }, { token: 'NO' });
  assert.equal(r.status, 401);
  s.close();
});

test('SPEAK log carries session/pane tag', async () => {
  const logs = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: () => {}, forward: () => Promise.resolve(), now: () => 0,
    log: (lvl, msg) => logs.push(msg) }));
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'hi', sessionId: 'abcd1234ef', pane: 'w1:p4' }, { token: 'T' });
  await flush();
  assert.ok(logs.some((m) => /SPEAK \[sess:abcd1234 pane:w1:p4\]/.test(m)), logs.join(' | '));
  s.close();
});

test('forward receives session/pane meta', async () => {
  let gotMeta;
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: () => {},
    forward: (ip, p, t, meta) => { gotMeta = meta; return Promise.resolve(); }, now: () => 0, log: noLog }));
  await postJson(`http://127.0.0.1:${port}/register`, { ip: '1.2.3.4' }, { token: 'T' });
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'x', sessionId: 's1', pane: 'p1' }, { token: 'T' });
  await flush();
  assert.deepEqual(gotMeta, { sessionId: 's1', pane: 'p1' });
  s.close();
});

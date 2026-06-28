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
const cfgOf = (over = {}) => () => ({ token: 'T', voice: 'Yelda', remoteTtlMs: 1000, ...over });

test('remote yok → lokal speak (fresh voice)', async () => {
  const spoken = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ voice: 'Yelda (Enhanced)' }), speak: (t, o) => spoken.push([t, o.voice]),
    forward: () => Promise.resolve(), now: () => 0, log: noLog }));
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'lokal' }, { token: 'T' });
  await flush();
  assert.deepEqual(spoken, [['lokal', 'Yelda (Enhanced)']]);
  s.close();
});

test('register → forward; lokal yok', async () => {
  const spoken = [], fwd = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: (t) => spoken.push(t),
    forward: (ip, p, t) => { fwd.push([ip, p, t]); return Promise.resolve(); }, now: () => 0, log: noLog }));
  await postJson(`http://127.0.0.1:${port}/register`, { ip: '1.2.3.4' }, { token: 'T' });
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'uzak' }, { token: 'T' });
  await flush();
  assert.deepEqual(fwd, [['1.2.3.4', 8973, 'uzak']]);
  assert.equal(spoken.length, 0);
  s.close();
});

test('forward hata → remote temizlenir + lokal fallback', async () => {
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

test('expired registration → lokal', async () => {
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

test('yanlış token → 401', async () => {
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: () => {}, forward: () => Promise.resolve(), now: () => 0, log: noLog }));
  const r = await postJson(`http://127.0.0.1:${port}/speak`, { text: 'x' }, { token: 'NO' });
  assert.equal(r.status, 401);
  s.close();
});

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

test('remote yok → lokal speak', async () => {
  const spoken = []; const fwd = [];
  const { s, port } = await start(makeRouter({
    token: 'T', voice: 'Yelda', ttlMs: 1000,
    speak: (t) => spoken.push(t), forward: (...a) => { fwd.push(a); return Promise.resolve(); }, now: () => 0,
  }));
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'lokal' }, { token: 'T' });
  await flush();
  assert.deepEqual(spoken, ['lokal']); assert.equal(fwd.length, 0);
  s.close();
});

test('register sonrası → forward; lokal speak yok', async () => {
  const spoken = []; const fwd = [];
  const { s, port } = await start(makeRouter({
    token: 'T', voice: 'Yelda', ttlMs: 1000,
    speak: (t) => spoken.push(t), forward: (ip, p, t) => { fwd.push([ip, p, t]); return Promise.resolve(); }, now: () => 0,
  }));
  await postJson(`http://127.0.0.1:${port}/register`, { ip: '100.111.159.123' }, { token: 'T' });
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'uzak' }, { token: 'T' });
  await flush();
  assert.deepEqual(fwd, [['100.111.159.123', 8973, 'uzak']]);
  assert.equal(spoken.length, 0);
  s.close();
});

test('forward hata → remote temizlenir + lokal fallback', async () => {
  const spoken = [];
  const { s, port } = await start(makeRouter({
    token: 'T', voice: 'Yelda', ttlMs: 1000,
    speak: (t) => spoken.push(t), forward: () => Promise.reject(new Error('down')), now: () => 0,
  }));
  await postJson(`http://127.0.0.1:${port}/register`, { ip: '1.2.3.4' }, { token: 'T' });
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'a' }, { token: 'T' });
  await flush(); await flush();
  assert.deepEqual(spoken, ['a']);
  // ikinci speak artık doğrudan lokal (remote temizlendi)
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'b' }, { token: 'T' });
  await flush();
  assert.deepEqual(spoken, ['a', 'b']);
  s.close();
});

test('expired registration → lokal speak', async () => {
  const spoken = []; let t = 0;
  const { s, port } = await start(makeRouter({
    token: 'T', voice: 'Yelda', ttlMs: 100,
    speak: (x) => spoken.push(x), forward: () => Promise.resolve(), now: () => t,
  }));
  await postJson(`http://127.0.0.1:${port}/register`, { ip: '1.2.3.4' }, { token: 'T' });
  t = 1000; // ttl geçti
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'c' }, { token: 'T' });
  await flush();
  assert.deepEqual(spoken, ['c']);
  s.close();
});

test('yanlış token → 401', async () => {
  const { s, port } = await start(makeRouter({
    token: 'T', voice: 'Yelda', ttlMs: 100, speak: () => {}, forward: () => Promise.resolve(), now: () => 0,
  }));
  const r = await postJson(`http://127.0.0.1:${port}/speak`, { text: 'x' }, { token: 'NO' });
  assert.equal(r.status, 401);
  s.close();
});

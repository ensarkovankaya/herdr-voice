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

// helper: GET JSON with the token header
function getJson(port, path, token = 'T') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'GET', headers: { 'x-voice-token': token } },
      (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, json: b ? JSON.parse(b) : null })); },
    );
    req.on('error', reject); req.end();
  });
}

test('no remote → local speak', async () => {
  const spoken = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: (t) => spoken.push(t),
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

test('SPEAK log carries session + herd meta fields', async () => {
  const logs = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ tts: { providers: ['piper'], piper: { voice: 'tr_TR-dfki-medium' } } }), speak: () => {}, forward: () => Promise.resolve(), now: () => 0,
    log: (level, event, fields = {}) => logs.push({ level, event, ...fields }) }));
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'hi', sessionId: 'abcd1234ef', sessionTitle: 'My Title', workspace: 'ws1', tab: 't1', pane: 'w1:p4' }, { token: 'T' });
  await flush();
  const rec = logs.find((e) => e.event === 'speak');
  assert.ok(rec, JSON.stringify(logs));
  assert.equal(rec.sessionId, 'abcd1234ef');
  assert.equal(rec.sessionTitle, 'My Title');
  assert.equal(rec.workspace, 'ws1');
  assert.equal(rec.tab, 't1');
  assert.equal(rec.pane, 'w1:p4');
  assert.equal(rec.provider, 'piper');
  assert.equal(rec.voice, 'tr_TR-dfki-medium');
  s.close();
});

test('forward receives full session + herd meta', async () => {
  let gotMeta;
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: () => {},
    forward: (ip, p, t, meta) => { gotMeta = meta; return Promise.resolve(); }, now: () => 0, log: noLog }));
  await postJson(`http://127.0.0.1:${port}/register`, { ip: '1.2.3.4' }, { token: 'T' });
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'x', sessionId: 's1', sessionTitle: 'My Title', workspace: 'ws1', tab: 't1', pane: 'p1' }, { token: 'T' });
  await flush();
  assert.deepEqual(gotMeta, { sessionId: 's1', sessionTitle: 'My Title', workspace: 'ws1', tab: 't1', pane: 'p1' });
  s.close();
});

test('GET /state requires the token', async () => {
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: () => {}, forward: () => Promise.resolve(), now: () => 0, log: noLog }));
  const r = await getJson(port, '/state', 'WRONG');
  assert.equal(r.status, 401);
  s.close();
});

test('GET /state reports enabled, tts and recent messages', async () => {
  const persisted = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ enabled: true, sessionDefault: 'on', muteFocusedPane: true, language: 'tr',
      tts: { providers: ['gemini', 'piper'] } }),
    speak: () => {}, forward: () => Promise.resolve(), now: () => 0, log: noLog,
    persist: (e) => persisted.push(e) }));
  await postJson(`http://127.0.0.1:${port}/speak`,
    { text: 'done', sessionId: 's1', sessionTitle: 'My App', pane: 'p1', kind: 'summary' }, { token: 'T' });
  await flush();
  const r = await getJson(port, '/state');
  assert.equal(r.status, 200);
  assert.equal(r.json.enabled, true);
  assert.equal(r.json.language, 'tr');
  assert.deepEqual(r.json.tts, { providers: ['gemini', 'piper'] });
  assert.equal(r.json.messages.length, 1);
  const m = r.json.messages[0];
  assert.equal(m.text, 'done');
  assert.equal(m.kind, 'summary');
  assert.equal(m.cueKind, null);
  assert.equal(m.sessionTitle, 'My App');
  assert.equal(m.pane, 'p1');
  assert.equal(m.mode, 'local');
  assert.equal(m.provider, 'gemini');
  assert.equal(persisted.length, 1);          // persist() called
  s.close();
});

test('ring buffer caps at ringSize and keeps the newest; text is capped', async () => {
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: () => {}, forward: () => Promise.resolve(), now: () => 0, log: noLog,
    ringSize: 3, textCap: 5 }));
  for (const t of ['a', 'b', 'c', 'd', 'toolongtext']) {
    await postJson(`http://127.0.0.1:${port}/speak`, { text: t }, { token: 'T' });
  }
  await flush();
  const r = await getJson(port, '/state');
  assert.deepEqual(r.json.messages.map((m) => m.text), ['c', 'd', 'toolo']); // last 3, capped to 5
  s.close();
});

test('cue kind flows into the recorded entry', async () => {
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: () => {}, forward: () => Promise.resolve(), now: () => 0, log: noLog }));
  await postJson(`http://127.0.0.1:${port}/speak`,
    { text: 'approval needed', kind: 'cue', cueKind: 'permission', sessionId: 's2' }, { token: 'T' });
  await flush();
  const r = await getJson(port, '/state');
  assert.equal(r.json.messages[0].kind, 'cue');
  assert.equal(r.json.messages[0].cueKind, 'permission');
  s.close();
});

test('remote registration shows up in /state', async () => {
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: () => {}, forward: () => Promise.resolve(), now: () => 0, log: noLog }));
  await postJson(`http://127.0.0.1:${port}/register`, { ip: '1.2.3.4', port: 8973 }, { token: 'T' });
  const r = await getJson(port, '/state');
  assert.equal(r.json.remote.present, true);
  assert.equal(r.json.remote.ip, '1.2.3.4');
  s.close();
});

// Open an SSE connection and resolve with the first `event: <name>` frame's data.
function sseWaitFor(port, name, token = 'T') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/events', method: 'GET', headers: { 'x-voice-token': token } },
      (res) => {
        let buf = '';
        res.on('data', (c) => {
          buf += c;
          let i;
          while ((i = buf.indexOf('\n\n')) !== -1) {
            const frame = buf.slice(0, i); buf = buf.slice(i + 2);
            const ev = /^event: (.+)$/m.exec(frame);
            const dat = /^data: (.+)$/m.exec(frame);
            if (ev && ev[1] === name && dat) { req.destroy(); resolve(JSON.parse(dat[1])); }
          }
        });
      },
    );
    req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e); });
    req.end();
  });
}

test('GET /events pushes a speak frame when an utterance is routed', async () => {
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: () => {}, forward: () => Promise.resolve(), now: () => 0, log: noLog }));
  const got = sseWaitFor(port, 'speak');
  await new Promise((r) => setTimeout(r, 50)); // let the SSE client connect
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'streamed', sessionId: 'sX', kind: 'cue', cueKind: 'idle' }, { token: 'T' });
  const entry = await got;
  assert.equal(entry.text, 'streamed');
  assert.equal(entry.kind, 'cue');
  assert.equal(entry.cueKind, 'idle');
  s.close();
});

test('POST /toggle turns voice ON: persists, logs, speaks confirmation, returns enabled', async () => {
  const spoken = []; const logs = []; const setCalls = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ enabled: false, voiceOnText: 'Ses açıldı.' }),
    speak: (t) => spoken.push(t), forward: () => Promise.resolve(), now: () => 0,
    log: (lvl, ev, f = {}) => logs.push({ ev, ...f }),
    setEnabled: (v) => { setCalls.push(v); return v; } }));
  const r = await postJson(`http://127.0.0.1:${port}/toggle`, {}, { token: 'T' });
  await flush();
  assert.deepEqual(JSON.parse(r.body), { enabled: true });
  assert.deepEqual(setCalls, [true]);
  assert.ok(logs.find((l) => l.ev === 'toggle' && l.enabled === true));
  assert.deepEqual(spoken, ['Ses açıldı.']);   // spoken when turning on
  s.close();
});

test('POST /toggle turns voice OFF: persists, no confirmation spoken', async () => {
  const spoken = []; const setCalls = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ enabled: true, voiceOnText: 'Ses açıldı.' }),
    speak: (t) => spoken.push(t), forward: () => Promise.resolve(), now: () => 0, log: noLog,
    setEnabled: (v) => { setCalls.push(v); return v; } }));
  const r = await postJson(`http://127.0.0.1:${port}/toggle`, {}, { token: 'T' });
  await flush();
  assert.deepEqual(JSON.parse(r.body), { enabled: false });
  assert.deepEqual(setCalls, [false]);
  assert.equal(spoken.length, 0);              // silent when turning off
  s.close();
});

test('GET /state reports audioMuted', async () => {
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ audioMuted: true }), speak: () => {}, forward: () => Promise.resolve(), now: () => 0, log: noLog }));
  const r = await getJson(port, '/state');
  assert.equal(r.json.audioMuted, true);
  s.close();
});

test('audioMuted: records + SSE-broadcasts but does not speak or forward', async () => {
  const spoken = []; const fwd = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ audioMuted: true }),
    speak: (t) => spoken.push(t),
    forward: (...a) => { fwd.push(a); return Promise.resolve(); },
    now: () => 0, log: noLog }));
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'silent' }, { token: 'T' });
  await flush();
  const r = await getJson(port, '/state');
  assert.equal(spoken.length, 0);              // no local audio
  assert.equal(fwd.length, 0);                 // no remote forward
  assert.equal(r.json.messages.length, 1);     // still recorded
  assert.equal(r.json.messages[0].text, 'silent');
  assert.equal(r.json.messages[0].mode, 'muted');
  s.close();
});

test('audioMuted still pushes the speak SSE frame (notifications survive)', async () => {
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ audioMuted: true }), speak: () => {}, forward: () => Promise.resolve(), now: () => 0, log: noLog }));
  const got = sseWaitFor(port, 'speak');
  await new Promise((r) => setTimeout(r, 50)); // let the SSE client connect
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'notif-only' }, { token: 'T' });
  const entry = await got;
  assert.equal(entry.text, 'notif-only');
  s.close();
});

test('POST /audio flips audioMuted ON: persists, logs, returns audioMuted', async () => {
  const setCalls = []; const logs = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ audioMuted: false }),
    speak: () => {}, forward: () => Promise.resolve(), now: () => 0,
    log: (lvl, ev, f = {}) => logs.push({ ev, ...f }),
    setAudioMuted: (v) => { setCalls.push(v); return v; } }));
  const r = await postJson(`http://127.0.0.1:${port}/audio`, {}, { token: 'T' });
  await flush();
  assert.deepEqual(JSON.parse(r.body), { audioMuted: true });
  assert.deepEqual(setCalls, [true]);
  assert.ok(logs.find((l) => l.ev === 'audio' && l.audioMuted === true));
  s.close();
});

test('POST /audio flips audioMuted OFF when already muted', async () => {
  const setCalls = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ audioMuted: true }),
    speak: () => {}, forward: () => Promise.resolve(), now: () => 0, log: noLog,
    setAudioMuted: (v) => { setCalls.push(v); return v; } }));
  const r = await postJson(`http://127.0.0.1:${port}/audio`, {}, { token: 'T' });
  await flush();
  assert.deepEqual(JSON.parse(r.body), { audioMuted: false });
  assert.deepEqual(setCalls, [false]);
  s.close();
});

test('a route that throws returns 500 without hanging', async () => {
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ enabled: false }), speak: () => {}, forward: () => Promise.resolve(), now: () => 0, log: noLog,
    setEnabled: () => { throw new Error('disk full'); } }));
  const r = await postJson(`http://127.0.0.1:${port}/toggle`, {}, { token: 'T' });
  assert.equal(r.status, 500);
  s.close();
});

test('GET /state reports summarize mode with authBroken=false by default', async () => {
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ summarize: { mode: 'claude' } }), speak: () => {}, forward: () => Promise.resolve(), now: () => 0, log: noLog }));
  const r = await getJson(port, '/state');
  assert.deepEqual(r.json.summarize, { mode: 'claude', authBroken: false });
  s.close();
});

test('summarizeAuthError flips authBroken and logs transitions once each way', async () => {
  const logs = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ summarize: { mode: 'claude' } }), speak: () => {}, forward: () => Promise.resolve(), now: () => 0,
    log: (lvl, ev, f = {}) => logs.push({ lvl, ev, ...f }) }));
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'a', kind: 'summary', summarizeAuthError: true }, { token: 'T' });
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'b', kind: 'summary', summarizeAuthError: true }, { token: 'T' });
  await flush();
  let r = await getJson(port, '/state');
  assert.equal(r.json.summarize.authBroken, true);
  assert.equal(logs.filter((l) => l.ev === 'summarize_auth').length, 1);   // transition only, not per-post
  assert.equal(logs.find((l) => l.ev === 'summarize_auth').lvl, 'WARN');
  assert.equal(logs.find((l) => l.ev === 'summarize_auth').broken, true);
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'c', kind: 'summary' }, { token: 'T' });
  await flush();
  r = await getJson(port, '/state');
  assert.equal(r.json.summarize.authBroken, false);
  assert.equal(logs.filter((l) => l.ev === 'summarize_auth').length, 2);
  assert.equal(logs.filter((l) => l.ev === 'summarize_auth')[1].broken, false);
  s.close();
});

test('cue posts never touch authBroken', async () => {
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ summarize: { mode: 'claude' } }), speak: () => {}, forward: () => Promise.resolve(), now: () => 0, log: noLog }));
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'a', kind: 'summary', summarizeAuthError: true }, { token: 'T' });
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'cue', kind: 'cue', cueKind: 'idle' }, { token: 'T' });
  await flush();
  const r = await getJson(port, '/state');
  assert.equal(r.json.summarize.authBroken, true);   // cue did not clear it
  s.close();
});

test('POST /replay speaks the last message again without re-recording', async () => {
  const spoken = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: (t) => spoken.push(t), forward: () => Promise.resolve(), now: () => 0, log: noLog }));
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'first' }, { token: 'T' });
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'second' }, { token: 'T' });
  await flush();
  const r = await postJson(`http://127.0.0.1:${port}/replay`, {}, { token: 'T' });
  await flush();
  assert.equal(r.status, 200);
  assert.deepEqual(spoken, ['first', 'second', 'second']);   // replay spoke the newest
  const st = await getJson(port, '/state');
  assert.equal(st.json.messages.length, 2);                  // NOT re-recorded
  s.close();
});

test('POST /replay {id} speaks that specific message', async () => {
  const spoken = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: (t) => spoken.push(t), forward: () => Promise.resolve(), now: () => 0, log: noLog }));
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'alpha' }, { token: 'T' });
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'beta' }, { token: 'T' });
  await flush();
  const st = await getJson(port, '/state');
  const alphaId = st.json.messages.find((m) => m.text === 'alpha').id;
  const r = await postJson(`http://127.0.0.1:${port}/replay`, { id: alphaId }, { token: 'T' });
  await flush();
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.body), { ok: true, id: alphaId });
  assert.equal(spoken[spoken.length - 1], 'alpha');
  s.close();
});

test('POST /replay → 404 when buffer empty or id unknown', async () => {
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf(), speak: () => {}, forward: () => Promise.resolve(), now: () => 0, log: noLog }));
  const r1 = await postJson(`http://127.0.0.1:${port}/replay`, {}, { token: 'T' });
  assert.equal(r1.status, 404);
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'x' }, { token: 'T' });
  await flush();
  const r2 = await postJson(`http://127.0.0.1:${port}/replay`, { id: 'nope' }, { token: 'T' });
  assert.equal(r2.status, 404);
  s.close();
});

test('POST /replay speaks even when audioMuted (explicit user intent) and logs replay', async () => {
  const spoken = []; const logs = [];
  const { s, port } = await start(makeRouter({
    getConfig: cfgOf({ audioMuted: true }), speak: (t) => spoken.push(t), forward: () => Promise.resolve(), now: () => 0,
    log: (lvl, ev, f = {}) => logs.push({ ev, ...f }) }));
  await postJson(`http://127.0.0.1:${port}/speak`, { text: 'muted msg' }, { token: 'T' });
  await flush();
  const r = await postJson(`http://127.0.0.1:${port}/replay`, {}, { token: 'T' });
  await flush();
  assert.equal(r.status, 200);
  assert.deepEqual(spoken, ['muted msg']);   // /speak was muted; /replay still spoke
  assert.ok(logs.find((l) => l.ev === 'replay'));
  s.close();
});

# herd-voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code bir işi bitirdiğinde (done) veya onay beklerken (blocked), o an oturulan cihazda kısa bir Türkçe sesli özet duyurmak.

**Architecture:** Host Mac'te Claude Code hook'ları (Stop/Notification) son asistan mesajını özetleyip host'taki `voice-router`'a (launchd ile yönetilen daemon) HTTP ile gönderir. Router, away-laptop attach iken (Tailscale üstünden `hr` wrapper'ı tarafından kaydedilmiş) sesi remote `voice-sink`'e iletir, değilse host'ta `say -v Yelda` ile çalar. herdr plugin yalnızca aç/kapa (toggle) + keybind + durum göstergesi sağlar.

**Tech Stack:** Node.js (stdlib `http`/`child_process`/`fs`; npm bağımlılığı yok), Bash (attach wrapper + plugin actions), macOS `say`, launchd, Tailscale, herdr ≥0.7.0.

## Global Constraints

- Node.js modülleri ESM (`.mjs`), **sıfır npm bağımlılığı** (yalnız stdlib). Test: `node --test`.
- TTS motoru v1: `say -v Yelda` (tr_TR). Motor değiştirilebilir kalsın ama v1'de tek backend.
- Tüm HTTP isteklerinde `X-Voice-Token` header'ı zorunlu; token `~/.config/herd-voice/config.json`'da.
- Konfig dosyası: `~/.config/herd-voice/config.json` (override: `HERD_VOICE_CONFIG` env). Alanlar: `token, host, port(8973), voice("Yelda"), enabled, remoteTtlMs(3600000), forwardTimeoutMs(1500), postTimeoutMs(1500), cue("Onayın gerekiyor.")`.
- Claude hook komutları ve launchd, **mutlak node yolu** kullanır (nvm; non-login PATH'te `node` olmayabilir). herdr plugin action'ları **bash** (herdr tarafında node-PATH gerektirmez).
- settings.json'a hook eklerken mevcut `SessionStart`/`PostToolUse` hook'ları **korunur** (merge, asla overwrite).
- Tailscale adresleri: host `mac-m4` = `100.109.4.84`, remote `mac-m2` = `100.111.159.123`. Router (host) `0.0.0.0:8973` dinler; host hook'ları `127.0.0.1`'e, remote wrapper host tailnet IP'sine POST eder.
- Proje kökü: `/Users/ensarkovankaya/Projects/herd-voice`.

## Prerequisites (uygulamadan önce doğrula)

- [ ] `herdr --version` ≥ `0.7.0` (plugin API min_herdr_version 0.7.0). Değilse: `herdr update`.
- [ ] `command -v node` → mutlak yol not edilir (manifest/launchd/hook için).
- [ ] `jq`, `curl`, `tailscale` mevcut (doğrulandı). `say -v Yelda` çalışıyor (doğrulandı).
- [ ] Away-laptop'ta da `node` + bu repo erişilebilir olacak (Task 12).

## File Structure

```
~/Projects/herd-voice/
  package.json                 # {"type":"module"} — ESM + node --test
  src/
    voice-router.mjs           # host daemon: routing + register/deregister
    voice-sink.mjs             # device daemon: /speak -> say
    speak-summary.mjs          # Claude Stop hook
    notify-cue.mjs             # Claude Notification hook
    lib/
      config.mjs               # loadConfig()/configPath()
      summarize.mjs            # summarize() — saf
      speak.mjs                # makeSpeak()/speak — seri kuyruk
      http.mjs                 # postJson/readJsonBody/sendJson
  test/
    config.test.mjs
    summarize.test.mjs
    http.test.mjs
    speak.test.mjs
    voice-sink.test.mjs
    voice-router.test.mjs
    speak-summary.test.mjs
    notify-cue.test.mjs
    fixtures/transcript.jsonl
  bin/hr                       # bash attach wrapper (remote)
  plugin/
    herdr-plugin.toml.tmpl     # @NODE@ yok; bash actions
    actions/toggle.sh
  launchd/dev.ensar.herd-voice.router.plist.tmpl
  install.sh                   # host kurulum
  install-remote.sh            # away-laptop kurulum
  README.md
```

______________________________________________________________________

### Task 1: Proje scaffold + `lib/config.mjs`

**Files:**

- Create: `package.json`, `src/lib/config.mjs`, `test/config.test.mjs`

**Interfaces:**

- Produces: `configPath(): string`, `loadConfig(): {token,host,port,voice,enabled,remoteTtlMs,forwardTimeoutMs,postTimeoutMs,cue}` (eksik dosyada DEFAULTS döner, kısmi dosyada merge).

- [ ] **Step 1: package.json oluştur**

```json
{
  "name": "herd-voice",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test" }
}
```

- [ ] **Step 2: Failing test yaz** — `test/config.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/lib/config.mjs';

test('missing file → defaults', () => {
  process.env.HERD_VOICE_CONFIG = join(mkdtempSync(join(tmpdir(), 'hv-')), 'nope.json');
  const c = loadConfig();
  assert.equal(c.port, 8973);
  assert.equal(c.voice, 'Yelda');
  assert.equal(c.enabled, false);
});

test('partial file merges over defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hv-'));
  const p = join(dir, 'config.json');
  writeFileSync(p, JSON.stringify({ token: 'abc', enabled: true, port: 9001 }));
  process.env.HERD_VOICE_CONFIG = p;
  const c = loadConfig();
  assert.equal(c.token, 'abc');
  assert.equal(c.enabled, true);
  assert.equal(c.port, 9001);
  assert.equal(c.voice, 'Yelda'); // default korunur
});
```

- [ ] **Step 3: Run → fail** — `node --test test/config.test.mjs` → FAIL (`Cannot find module .../config.mjs`).

- [ ] **Step 4: `src/lib/config.mjs` yaz**

```js
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULTS = {
  token: '',
  host: '127.0.0.1',
  port: 8973,
  voice: 'Yelda',
  enabled: false,
  remoteTtlMs: 3_600_000,
  forwardTimeoutMs: 1500,
  postTimeoutMs: 1500,
  cue: 'Onayın gerekiyor.',
};

export function configPath() {
  return process.env.HERD_VOICE_CONFIG
    || join(homedir(), '.config', 'herd-voice', 'config.json');
}

export function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(configPath(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}
```

- [ ] **Step 5: Run → pass** — `node --test test/config.test.mjs` → PASS.

- [ ] **Step 6: Commit**

```bash
git -C ~/Projects/herd-voice add package.json src/lib/config.mjs test/config.test.mjs
git -C ~/Projects/herd-voice commit -m "feat: config loader (defaults + merge)"
```

______________________________________________________________________

### Task 2: `lib/summarize.mjs` (saf özetleyici)

**Files:**

- Create: `src/lib/summarize.mjs`, `test/summarize.test.mjs`

**Interfaces:**

- Produces: `summarize(text: string, opts?: {maxLen?:number, fallback?:string}): string`. Markdown/kod temizler, boş/kod-only ise `fallback` ("Tamamlandı."), uzunsa ilk cümle(ler) ≤ maxLen (240).

- [ ] **Step 1: Failing test** — `test/summarize.test.mjs`

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../src/lib/summarize.mjs';

test('boş/kod-only → fallback', () => {
  assert.equal(summarize(''), 'Tamamlandı.');
  assert.equal(summarize('```js\nconst x=1;\n```'), 'Tamamlandı.');
});

test('kısa prose olduğu gibi, markdown temizlenir', () => {
  assert.equal(summarize('## Bitti\nTest **geçti**.'), 'Bitti Test geçti.');
});

test('uzun metin ilk cümleyle sınırlanır (≤240)', () => {
  const long = 'Birinci cümle burada. ' + 'x'.repeat(300) + '.';
  const out = summarize(long);
  assert.ok(out.length <= 240);
  assert.ok(out.startsWith('Birinci cümle burada.'));
});

test('kod bloğu atılır, çevresi kalır', () => {
  const out = summarize('İşlem tamam.\n```\nrm -rf /\n```\nDevam.');
  assert.equal(out, 'İşlem tamam. Devam.');
});
````

- [ ] **Step 2: Run → fail** — `node --test test/summarize.test.mjs`.

- [ ] **Step 3: `src/lib/summarize.mjs` yaz**

````js
export function summarize(text, { maxLen = 240, fallback = 'Tamamlandı.' } = {}) {
  if (!text || typeof text !== 'string') return fallback;
  let t = text
    .replace(/```[\s\S]*?```/g, ' ')              // fenced code
    .replace(/`[^`]*`/g, ' ')                      // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')         // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')       // links -> text
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '') // başlık/list/quote
    .replace(/[*_~`]{1,3}/g, '')                   // emphasis markers
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return fallback;
  if (t.length <= maxLen) return t;
  const parts = t.split(/(?<=[.!?…])\s+/);
  let out = '';
  for (const p of parts) {
    if (!out) out = p;
    else if ((out + ' ' + p).length <= maxLen) out += ' ' + p;
    else break;
  }
  if (out.length > maxLen) out = out.slice(0, maxLen - 1).trimEnd() + '…';
  return out;
}
````

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit**

```bash
git -C ~/Projects/herd-voice add src/lib/summarize.mjs test/summarize.test.mjs
git -C ~/Projects/herd-voice commit -m "feat: summarize (markdown strip + sentence cap)"
```

______________________________________________________________________

### Task 3: `lib/http.mjs` (HTTP yardımcıları)

**Files:**

- Create: `src/lib/http.mjs`, `test/http.test.mjs`

**Interfaces:**

- Produces: `postJson(url, body, {token?, timeoutMs?}): Promise<{status,body}>`, `readJsonBody(req, {limit?}): Promise<object>`, `sendJson(res, status, obj): void`.

- Consumes: yok.

- [ ] **Step 1: Failing test** — `test/http.test.mjs`

```js
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
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: `src/lib/http.mjs` yaz**

```js
import http from 'node:http';

export function postJson(urlStr, body, { token = '', timeoutMs = 1500 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = Buffer.from(JSON.stringify(body ?? {}));
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname || '/', method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': data.length,
        'x-voice-token': token,
      },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.end(data);
  });
}

export function readJsonBody(req, { limit = 1_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    let buf = ''; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { req.destroy(); reject(new Error('payload too large')); }
      else buf += c;
    });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

export function sendJson(res, status, obj) {
  const data = JSON.stringify(obj ?? {});
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(data);
}
```

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit**

```bash
git -C ~/Projects/herd-voice add src/lib/http.mjs test/http.test.mjs
git -C ~/Projects/herd-voice commit -m "feat: http helpers (postJson/readJsonBody/sendJson)"
```

______________________________________________________________________

### Task 4: `lib/speak.mjs` (seri konuşma kuyruğu)

**Files:**

- Create: `src/lib/speak.mjs`, `test/speak.test.mjs`

**Interfaces:**

- Produces: `makeSpeak(spawnImpl?): (text, {voice?}) => Promise<void>` ve `speak` (varsayılan, gerçek spawn). Boş metin atlanır; çağrılar **seri** çalışır (üst üste binmez).

- Consumes: `node:child_process.spawn`.

- [ ] **Step 1: Failing test** — `test/speak.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makeSpeak } from '../src/lib/speak.mjs';

test('boş metin spawn etmez', async () => {
  let calls = 0;
  const speak = makeSpeak(() => { calls++; const e = new EventEmitter(); queueMicrotask(() => e.emit('close')); return e; });
  await speak('   ');
  assert.equal(calls, 0);
});

test('çağrılar seri: ikincisi birincisi bitene kadar başlamaz', async () => {
  const emitters = [];
  const speak = makeSpeak((cmd, args) => {
    const e = new EventEmitter(); e._args = args; emitters.push(e); return e;
  });
  speak('bir'); speak('iki');
  assert.equal(emitters.length, 1);                 // sadece ilki spawn edildi
  assert.deepEqual(emitters[0]._args, ['-v', 'Yelda', 'bir']);
  emitters[0].emit('close');                        // ilki bitti
  await new Promise((r) => setImmediate(r));
  assert.equal(emitters.length, 2);                 // şimdi ikincisi
  assert.deepEqual(emitters[1]._args, ['-v', 'Yelda', 'iki']);
});
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: `src/lib/speak.mjs` yaz**

```js
import { spawn as realSpawn } from 'node:child_process';

export function makeSpeak(spawnImpl = realSpawn) {
  let chain = Promise.resolve();
  return function speak(text, { voice = 'Yelda' } = {}) {
    const t = (text || '').trim();
    if (!t) return chain;
    chain = chain.then(() => new Promise((resolve) => {
      let child;
      try { child = spawnImpl('say', ['-v', voice, t], { stdio: 'ignore' }); }
      catch { return resolve(); }
      child.on('error', () => resolve());
      child.on('close', () => resolve());
    }));
    return chain;
  };
}

export const speak = makeSpeak();
```

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Manuel duyum (opsiyonel):** `node -e "import('./src/lib/speak.mjs').then(m=>m.speak('Merhaba, herd voice çalışıyor.'))"` → sesi duy.
- [ ] **Step 6: Commit**

```bash
git -C ~/Projects/herd-voice add src/lib/speak.mjs test/speak.test.mjs
git -C ~/Projects/herd-voice commit -m "feat: serial say -v Yelda speaker"
```

______________________________________________________________________

### Task 5: `voice-sink.mjs` (cihaz daemon'u)

**Files:**

- Create: `src/voice-sink.mjs`, `test/voice-sink.test.mjs`

**Interfaces:**

- Produces: `makeSinkHandler({token, voice, speak}): (req,res)=>void`. `GET /health`→200; `POST /speak` (token zorunlu) → 202 + `speak(text)`; yanlış token→401.

- Consumes: `lib/http.mjs`, `lib/speak.mjs`, `lib/config.mjs`.

- [ ] **Step 1: Failing test** — `test/voice-sink.test.mjs`

```js
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
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: `src/voice-sink.mjs` yaz**

```js
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { readJsonBody, sendJson } from './lib/http.mjs';
import { speak as realSpeak } from './lib/speak.mjs';

export function makeSinkHandler({ token, voice, speak }) {
  return async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true });
    if (req.method === 'POST' && req.url === '/speak') {
      if ((req.headers['x-voice-token'] || '') !== token) return sendJson(res, 401, { error: 'unauthorized' });
      let body;
      try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { error: 'bad json' }); }
      sendJson(res, 202, { ok: true });        // önce cevap, sonra async konuş
      speak(body.text, { voice });
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  };
}

function main() {
  const cfg = loadConfig();
  const bind = process.env.HERD_VOICE_BIND || '0.0.0.0';
  const handler = makeSinkHandler({ token: cfg.token, voice: cfg.voice, speak: realSpeak });
  http.createServer(handler).listen(cfg.port, bind, () => {
    console.log(`voice-sink listening ${bind}:${cfg.port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit**

```bash
git -C ~/Projects/herd-voice add src/voice-sink.mjs test/voice-sink.test.mjs
git -C ~/Projects/herd-voice commit -m "feat: voice-sink daemon (token-gated /speak)"
```

______________________________________________________________________

### Task 6: `voice-router.mjs` (host daemon: routing + register)

**Files:**

- Create: `src/voice-router.mjs`, `test/voice-router.test.mjs`

**Interfaces:**

- Produces: `makeRouter({token, voice, ttlMs, speak, forward, now}): (req,res)=>void`.

  - `POST /register {ip, port?, ttlMs?}` → aktif remote = `{ip, port, expiresAt: now()+ttl}`; 200.
  - `POST /deregister` → aktif remote = null; 200.
  - `POST /speak {text}` → 202; sonra route: aktif&süre içinde → `forward(ip,port,text)`; hata → remote temizle + `speak(text)`; remote yok/expired → `speak(text)`.
  - `GET /health` → 200. Token tüm POST'larda zorunlu.

- Consumes: `lib/http.mjs`, `lib/speak.mjs`, `lib/config.mjs`. `forward` Task 11'de `lib/http.postJson` ile bağlanır.

- [ ] **Step 1: Failing test** — `test/voice-router.test.mjs`

```js
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
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: `src/voice-router.mjs` yaz**

```js
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { readJsonBody, sendJson, postJson } from './lib/http.mjs';
import { speak as realSpeak } from './lib/speak.mjs';

export function makeRouter({ token, voice, ttlMs, speak, forward, now = Date.now }) {
  let remote = null; // {ip, port, expiresAt}

  function route(text) {
    if (remote && now() < remote.expiresAt) {
      const { ip, port } = remote;
      Promise.resolve()
        .then(() => forward(ip, port, text))
        .catch(() => { remote = null; speak(text, { voice }); });
    } else {
      speak(text, { voice });
    }
  }

  return async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true });
    if (req.method !== 'POST') return sendJson(res, 404, { error: 'not found' });
    if ((req.headers['x-voice-token'] || '') !== token) return sendJson(res, 401, { error: 'unauthorized' });
    let body;
    try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { error: 'bad json' }); }

    if (req.url === '/register') {
      if (!body.ip) return sendJson(res, 400, { error: 'ip required' });
      remote = { ip: body.ip, port: body.port || 8973, expiresAt: now() + (body.ttlMs || ttlMs) };
      return sendJson(res, 200, { ok: true, remote: { ip: remote.ip, port: remote.port } });
    }
    if (req.url === '/deregister') { remote = null; return sendJson(res, 200, { ok: true }); }
    if (req.url === '/speak') { sendJson(res, 202, { ok: true }); route(body.text); return; }
    return sendJson(res, 404, { error: 'not found' });
  };
}

function main() {
  const cfg = loadConfig();
  const bind = process.env.HERD_VOICE_BIND || '0.0.0.0';
  const forward = (ip, port, text) =>
    postJson(`http://${ip}:${port}/speak`, { text }, { token: cfg.token, timeoutMs: cfg.forwardTimeoutMs })
      .then((r) => { if (r.status >= 300) throw new Error(`sink status ${r.status}`); });
  const handler = makeRouter({
    token: cfg.token, voice: cfg.voice, ttlMs: cfg.remoteTtlMs,
    speak: realSpeak, forward, now: Date.now,
  });
  http.createServer(handler).listen(cfg.port, bind, () => {
    console.log(`voice-router listening ${bind}:${cfg.port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit**

```bash
git -C ~/Projects/herd-voice add src/voice-router.mjs test/voice-router.test.mjs
git -C ~/Projects/herd-voice commit -m "feat: voice-router (register/deregister + route with fallback)"
```

______________________________________________________________________

### Task 7: `speak-summary.mjs` (Claude Stop hook)

**Files:**

- Create: `src/speak-summary.mjs`, `test/speak-summary.test.mjs`, `test/fixtures/transcript.jsonl`

**Interfaces:**

- Produces: `extractLastAssistantText(jsonl: string): string` (metin bloğu olan **son** assistant mesajını döner; tool_use-only satırları atlar; `message.content` nested veya düz ve string|array hepsini ele alır).
- `main()`: stdin'den `{transcript_path}` JSON oku → extract → `summarize` → `enabled` ise router'a `POST /speak`. Hata yutulur, exit 0 (Claude'u bloklamaz).
- Consumes: `lib/config.mjs`, `lib/summarize.mjs`, `lib/http.mjs`.

**Gerçek transcript satır şekli** (canlı dosyadan doğrulandı): `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."}|{"type":"tool_use",...}]}, ...}`.

- [ ] **Step 1: Fixture yaz** — `test/fixtures/transcript.jsonl` (her satır tek JSON; son assistant satırı tool_use-only → bir önceki text alınmalı)

```
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"selam"}]}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Testleri çalıştırdım ve hepsi geçti."}]}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","input":{}}]}}
```

- [ ] **Step 2: Failing test** — `test/speak-summary.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { extractLastAssistantText } from '../src/speak-summary.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('tool_use-only son satırı atlar, metinli son assistant mesajını alır', () => {
  const jsonl = readFileSync(join(here, 'fixtures', 'transcript.jsonl'), 'utf8');
  assert.equal(extractLastAssistantText(jsonl), 'Testleri çalıştırdım ve hepsi geçti.');
});

test('string content ve bozuk satırlar', () => {
  const jsonl = [
    'BOZUK SATIR',
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'Düz metin cevap.' } }),
  ].join('\n');
  assert.equal(extractLastAssistantText(jsonl), 'Düz metin cevap.');
});

test('assistant yoksa boş string', () => {
  assert.equal(extractLastAssistantText('{"type":"user","message":{"role":"user","content":[]}}'), '');
});
```

- [ ] **Step 3: Run → fail.**
- [ ] **Step 4: `src/speak-summary.mjs` yaz**

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { summarize } from './lib/summarize.mjs';
import { postJson } from './lib/http.mjs';

export function extractLastAssistantText(jsonl) {
  const lines = jsonl.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const msg = o && typeof o.message === 'object' && o.message ? o.message : o;
    const isAssistant = o.type === 'assistant' || (msg && msg.role === 'assistant');
    if (!isAssistant) continue;
    const content = msg.content;
    if (typeof content === 'string') { if (content.trim()) return content.trim(); continue; }
    if (Array.isArray(content)) {
      const texts = content
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text);
      if (texts.length) return texts.join('\n').trim();
    }
  }
  return '';
}

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', () => resolve(buf));
  });
}

async function main() {
  const cfg = loadConfig();
  if (!cfg.enabled) return;
  let input;
  try { input = JSON.parse(await readStdin()); } catch { return; }
  if (!input.transcript_path) return;
  let jsonl;
  try { jsonl = readFileSync(input.transcript_path, 'utf8'); } catch { return; }
  const text = summarize(extractLastAssistantText(jsonl));
  try {
    await postJson(`http://${cfg.host}:${cfg.port}/speak`, { text }, { token: cfg.token, timeoutMs: cfg.postTimeoutMs });
  } catch { /* yut */ }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 5: Run → pass.**
- [ ] **Step 6: Commit**

```bash
git -C ~/Projects/herd-voice add src/speak-summary.mjs test/speak-summary.test.mjs test/fixtures/transcript.jsonl
git -C ~/Projects/herd-voice commit -m "feat: Stop hook (extract last assistant text + summarize + POST)"
```

______________________________________________________________________

### Task 8: `notify-cue.mjs` (Claude Notification hook)

**Files:**

- Create: `src/notify-cue.mjs`, `test/notify-cue.test.mjs`

**Interfaces:**

- Produces: `cueFor(input, cfg): string` (v1: sabit `cfg.cue`). `main()`: stdin oku → `enabled` ise router'a `POST /speak {text: cueFor(...)}`.

- Consumes: `lib/config.mjs`, `lib/http.mjs`.

- [ ] **Step 1: Failing test** — `test/notify-cue.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cueFor } from '../src/notify-cue.mjs';

test('v1: konfigdeki sabit cue döner', () => {
  assert.equal(cueFor({ notification_type: 'permission_prompt', message: 'Bash: npm test' }, { cue: 'Onayın gerekiyor.' }), 'Onayın gerekiyor.');
});
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: `src/notify-cue.mjs` yaz**

```js
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { postJson } from './lib/http.mjs';

export function cueFor(_input, cfg) {
  return cfg.cue;
}

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', () => resolve(buf));
  });
}

async function main() {
  const cfg = loadConfig();
  if (!cfg.enabled) return;
  let input = {};
  try { input = JSON.parse(await readStdin()); } catch { /* yine de sabit cue */ }
  try {
    await postJson(`http://${cfg.host}:${cfg.port}/speak`, { text: cueFor(input, cfg) }, { token: cfg.token, timeoutMs: cfg.postTimeoutMs });
  } catch { /* yut */ }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Tüm testler:** `node --test` → hepsi PASS.
- [ ] **Step 6: Commit**

```bash
git -C ~/Projects/herd-voice add src/notify-cue.mjs test/notify-cue.test.mjs
git -C ~/Projects/herd-voice commit -m "feat: Notification hook (fixed cue)"
```

______________________________________________________________________

### Task 9: herdr plugin (manifest + bash toggle action)

**Files:**

- Create: `plugin/herdr-plugin.toml.tmpl`, `plugin/actions/toggle.sh`

**Interfaces:**

- Produces: herdr plugin `ensar.herd-voice` actions: `toggle`/`enable`/`disable` → `~/.config/herd-voice/config.json` içindeki `enabled`'ı yazar + terminal title göstergesi.
- Consumes: yok (bağımsız; config'i jq ile günceller).

> Not: Manifest commit edilen şablon (`.tmpl`). `install.sh` `@ROOT@`'u doldurup `herdr-plugin.toml` üretir, sonra `herdr plugin link` eder. min_herdr_version 0.7.0 — Prerequisites'ta doğrulandı.

- [ ] **Step 1: `plugin/herdr-plugin.toml.tmpl` yaz**

```toml
id = "ensar.herd-voice"
name = "herd-voice"
version = "0.1.0"
min_herdr_version = "0.7.0"
description = "Aktif cihazda Claude sesli özet (say -v Yelda)."
platforms = ["macos"]

[[actions]]
id = "toggle"
title = "herd-voice: ses aç/kapa"
command = ["bash", "actions/toggle.sh"]

[[actions]]
id = "enable"
title = "herd-voice: ses aç"
command = ["bash", "actions/toggle.sh", "on"]

[[actions]]
id = "disable"
title = "herd-voice: ses kapa"
command = ["bash", "actions/toggle.sh", "off"]
```

- [ ] **Step 2: `plugin/actions/toggle.sh` yaz**

```bash
#!/usr/bin/env bash
set -euo pipefail
CFG="${HERD_VOICE_CONFIG:-$HOME/.config/herd-voice/config.json}"
mode="${1:-toggle}"
[ -f "$CFG" ] || { echo "config yok: $CFG" >&2; exit 1; }
cur=$(jq -r '.enabled // false' "$CFG")
case "$mode" in
  on)  new=true ;;
  off) new=false ;;
  *)   if [ "$cur" = "true" ]; then new=false; else new=true; fi ;;
esac
tmp=$(mktemp)
jq --argjson e "$new" '.enabled=$e' "$CFG" > "$tmp" && mv "$tmp" "$CFG"
if [ "$new" = "true" ]; then printf '\033]0;🔈 herd-voice on\007'; else printf '\033]0;herd-voice off\007'; fi
echo "herd-voice enabled=$new"
```

- [ ] **Step 3: Çalıştırılabilir yap + manuel test**

```bash
chmod +x ~/Projects/herd-voice/plugin/actions/toggle.sh
mkdir -p ~/.config/herd-voice && echo '{"enabled":false}' > ~/.config/herd-voice/config.json
bash ~/Projects/herd-voice/plugin/actions/toggle.sh on   # -> enabled=true
jq '.enabled' ~/.config/herd-voice/config.json           # -> true
bash ~/Projects/herd-voice/plugin/actions/toggle.sh off  # -> enabled=false
```

Expected: `enabled` alanı true/false arası geçiyor.

- [ ] **Step 4: Commit**

```bash
git -C ~/Projects/herd-voice add plugin/
git -C ~/Projects/herd-voice commit -m "feat: herdr plugin (toggle/enable/disable bash actions)"
```

______________________________________________________________________

### Task 10: `bin/hr` attach wrapper (away-laptop, Bash)

**Files:**

- Create: `bin/hr`

**Interfaces:**

- Consumes: away-laptop'taki `~/.config/herd-voice/config.json` (`token`, `host`=host-mac Tailscale IP, `port`), `voice-sink.mjs`, `tailscale`, `node`.
- Davranış: lokal sink'i ayağa kaldır → host router'a `register{ip=bu cihazın TS IP'si}` → `herdr --remote <host-alias>` → çıkışta `deregister`.

> Not: `herdr --remote` hedefi host'un SSH/Tailscale adıdır; `HERD_REMOTE_HOST` env veya 1. argümandan alınır (örn. `mac-m4`). Router adresi config'teki `host` (örn. `100.109.4.84`).

- [ ] **Step 1: `bin/hr` yaz**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG="${HERD_VOICE_CONFIG:-$HOME/.config/herd-voice/config.json}"
NODE="$(command -v node)"
REMOTE_HOST="${1:-${HERD_REMOTE_HOST:-mac-m4}}"   # herdr --remote hedefi (host mac)

token=$(jq -r '.token' "$CFG")
router=$(jq -r '.host' "$CFG")                    # host router IP (örn 100.109.4.84)
port=$(jq -r '.port // 8973' "$CFG")
myip=$(tailscale ip -4 | head -1)

# 1) lokal sink çalışıyor mu? değilse başlat (detached)
if ! curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
  nohup "$NODE" "$ROOT/src/voice-sink.mjs" >"$ROOT/sink.log" 2>&1 &
  for _ in 1 2 3 4 5 10; do
    curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1 && break
    sleep 0.3
  done
fi

# 2) host router'a kaydol
curl -fsS -m 3 -X POST "http://${router}:${port}/register" \
  -H "x-voice-token: ${token}" -H 'content-type: application/json' \
  -d "{\"ip\":\"${myip}\",\"port\":${port}}" >/dev/null || echo "uyarı: register başarısız" >&2

# 3) çıkışta kaydı sil
cleanup() {
  curl -fsS -m 3 -X POST "http://${router}:${port}/deregister" \
    -H "x-voice-token: ${token}" -H 'content-type: application/json' -d '{}' >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 4) herdr remote attach
exec herdr --remote "$REMOTE_HOST"
```

- [ ] **Step 2: Çalıştırılabilir yap**

```bash
chmod +x ~/Projects/herd-voice/bin/hr
```

- [ ] **Step 3: Söz dizimi kontrolü (host'ta, attach etmeden)**

```bash
bash -n ~/Projects/herd-voice/bin/hr && echo "syntax ok"
```

Expected: `syntax ok`. (Gerçek uçtan uca test Task 12'de.)

- [ ] **Step 4: Commit**

```bash
git -C ~/Projects/herd-voice add bin/hr
git -C ~/Projects/herd-voice commit -m "feat: hr attach wrapper (sink up + register/deregister + herdr --remote)"
```

______________________________________________________________________

### Task 11: launchd + `install.sh` (host kurulum) + lokal uçtan uca

**Files:**

- Create: `launchd/dev.ensar.herd-voice.router.plist.tmpl`, `install.sh`

**Interfaces:**

- Consumes: tüm `src/*`, `plugin/*`, mutlak `node`, `jq`. settings.json'a Stop/Notification hook **merge** eder; launchd router'ı yükler; herdr plugin'i link'ler.

- [ ] **Step 1: launchd şablonu** — `launchd/dev.ensar.herd-voice.router.plist.tmpl`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>dev.ensar.herd-voice.router</string>
  <key>ProgramArguments</key>
  <array>
    <string>@NODE@</string>
    <string>@ROOT@/src/voice-router.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>HERD_VOICE_BIND</key><string>0.0.0.0</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>@ROOT@/router.out.log</string>
  <key>StandardErrorPath</key><string>@ROOT@/router.err.log</string>
</dict>
</plist>
```

- [ ] **Step 2: `install.sh` yaz** (host)

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$(command -v node)"
CFG_DIR="$HOME/.config/herd-voice"
CFG="$CFG_DIR/config.json"
SETTINGS="$HOME/.claude/settings.json"

echo "node: $NODE"
herdr --version

# 1) config (yoksa oluştur; token üret). host=127.0.0.1 (hook'lar buraya POST eder)
mkdir -p "$CFG_DIR"
if [ ! -f "$CFG" ]; then
  TOKEN="$(openssl rand -hex 16)"
  cat > "$CFG" <<JSON
{
  "token": "$TOKEN",
  "host": "127.0.0.1",
  "port": 8973,
  "voice": "Yelda",
  "enabled": true,
  "remoteTtlMs": 3600000,
  "forwardTimeoutMs": 1500,
  "postTimeoutMs": 1500,
  "cue": "Onayın gerekiyor."
}
JSON
  echo "config yazıldı: $CFG (token üretildi)"
else
  echo "config zaten var: $CFG"
fi

# 2) Claude hook'larını settings.json'a MERGE et (mevcutları koru)
CMD_STOP="\"$NODE\" \"$ROOT/src/speak-summary.mjs\""
CMD_NOTIFY="\"$NODE\" \"$ROOT/src/notify-cue.mjs\""
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
tmp="$(mktemp)"
jq \
  --arg stop "$CMD_STOP" --arg notify "$CMD_NOTIFY" '
  .hooks = (.hooks // {})
  | .hooks.Stop = ((.hooks.Stop // []) + [{"hooks":[{"type":"command","command":$stop}]}])
  | .hooks.Notification = ((.hooks.Notification // []) + [{"matcher":"permission_prompt|idle_prompt","hooks":[{"type":"command","command":$notify}]}])
  ' "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
echo "settings.json hook'ları eklendi (Stop + Notification)"

# 3) launchd router
PLIST="$HOME/Library/LaunchAgents/dev.ensar.herd-voice.router.plist"
sed -e "s#@NODE@#$NODE#g" -e "s#@ROOT@#$ROOT#g" \
  "$ROOT/launchd/dev.ensar.herd-voice.router.plist.tmpl" > "$PLIST"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
sleep 1
curl -fsS "http://127.0.0.1:8973/health" && echo " <- router up" || echo "router health FAIL"

# 4) herdr plugin: manifest üret + link
sed -e "s#@ROOT@#$ROOT#g" "$ROOT/plugin/herdr-plugin.toml.tmpl" > "$ROOT/plugin/herdr-plugin.toml"
herdr plugin link "$ROOT/plugin" || echo "uyarı: herdr plugin link başarısız (herdr ≥0.7.0?)"

echo "Bitti. herdr keybind eklemek için ~/.config/herdr/config.toml içine:"
echo '  [[keys.command]]'
echo '  key = "prefix+shift+v"'
echo '  type = "plugin_action"'
echo '  command = "ensar.herd-voice.toggle"'
echo '  description = "herd-voice ses aç/kapa"'
```

- [ ] **Step 3: Çalıştır**

```bash
chmod +x ~/Projects/herd-voice/install.sh
~/Projects/herd-voice/install.sh
```

Expected: `router up`, settings.json güncellendi, plugin link ok.

- [ ] **Step 4: settings.json doğrula (mevcut hook'lar korundu mu)**

```bash
jq '.hooks | keys' ~/.claude/settings.json
```

Expected: `["Notification","PostToolUse","SessionStart","Stop"]` (eskiler duruyor).

- [ ] **Step 5: Router'a doğrudan speak (lokal duyum)**

```bash
TOKEN=$(jq -r .token ~/.config/herd-voice/config.json)
curl -fsS -X POST http://127.0.0.1:8973/speak -H "x-voice-token: $TOKEN" \
  -H 'content-type: application/json' -d '{"text":"Kurulum tamam, sesi duyuyorsun."}'
```

Expected: Mac hoparlöründen Türkçe ses.

- [ ] **Step 6: Lokal uçtan uca (Claude Stop hook)** — Yeni bir Claude Code oturumunda kısa bir görev tamamlat. Beklenen: Claude bitince son mesajın özeti host'ta seslenir.

- [ ] **Step 7: Commit**

```bash
git -C ~/Projects/herd-voice add launchd/ install.sh
git -C ~/Projects/herd-voice commit -m "feat: launchd router + host install.sh (settings merge, plugin link)"
```

______________________________________________________________________

### Task 12: Remote kurulum + uçtan uca remote kabul

**Files:**

- Create: `install-remote.sh`, `README.md`

**Interfaces:**

- Away-laptop'ta: repo klonlanır, `~/.config/herd-voice/config.json` (host=host-mac TS IP `100.109.4.84`, **token host ile aynı**), `bin/hr` PATH'e.

- [ ] **Step 1: `install-remote.sh` yaz**

```bash
#!/usr/bin/env bash
set -euo pipefail
# Kullanım: install-remote.sh <HOST_TS_IP> <TOKEN>  (TOKEN host config'inden kopyalanır)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_IP="${1:?host Tailscale IP gerekli (örn 100.109.4.84)}"
TOKEN="${2:?token gerekli (host ~/.config/herd-voice/config.json .token)}"
CFG_DIR="$HOME/.config/herd-voice"
mkdir -p "$CFG_DIR"
cat > "$CFG_DIR/config.json" <<JSON
{
  "token": "$TOKEN",
  "host": "$HOST_IP",
  "port": 8973,
  "voice": "Yelda",
  "enabled": true,
  "forwardTimeoutMs": 1500,
  "postTimeoutMs": 1500
}
JSON
echo "remote config yazıldı. hr için:  $ROOT/bin/hr  (veya PATH'e ekle)"
```

- [ ] **Step 2: README.md** (kurulum özeti — host: `install.sh`; remote: repoyu klonla, `install-remote.sh <host-ip> <token>`, attach için `bin/hr [host-alias]`).

```markdown
# herd-voice
Claude Code done/blocked → aktif cihazda Türkçe sesli özet (say -v Yelda).
## Host (Mac, Claude buradan koşar)
`./install.sh`  → config+token, launchd router, Claude hook'ları, herdr plugin.
## Remote (away-laptop)
1. repoyu klonla
2. `./install-remote.sh 100.109.4.84 <host-token>`
3. attach: `./bin/hr mac-m4`  (herdr --remote + sesi bu cihaza yönlendirir)
## Aç/kapa
herdr içinde `prefix+shift+v`, ya da `herdr plugin action invoke toggle --plugin ensar.herd-voice`.
```

- [ ] **Step 3: Remote'ta kur** (away-laptop'ta çalıştır): repo klon + `install-remote.sh` + `bin/hr mac-m4`.

- [ ] **Step 4: Uçtan uca remote kabul**

  1. Away-laptop'ta `./bin/hr mac-m4` ile attach.
  2. Host router log: `register` geldi mi → `tail -f ~/Projects/herd-voice/router.*.log`.
  3. Attach içinde Claude'a kısa görev yaptır → ses **away-laptop'tan** çıkmalı.
  4. `blocked`: onay isteyen komut → "Onayın gerekiyor." away-laptop'ta.
  5. `hr`'den çık (detach) → host'ta görev → ses tekrar **host'tan**.

- [ ] **Step 5: Commit**

```bash
git -C ~/Projects/herd-voice add install-remote.sh README.md
git -C ~/Projects/herd-voice commit -m "feat: remote install + README + e2e acceptance"
```

______________________________________________________________________

## Bilinen Sınırlamalar (v1)

- Away-laptop açık/erişilebilir ama başında değilsen ve temiz `deregister` olmadıysa (ör. ani kapanış), TTL dolana kadar ses boş odaya gidebilir. Hafifletme: `hr` `trap EXIT` deregister + `prefix+shift+v` ile sustur.
- Aynı anda birden fazla cihazdan attach → son `register` kazanır (tek aktif sink).
- Telefon/tablet (thin SSH client) desteklenmez (lokal süreç yok).
- `say` Türkçe kalitesi orta; motor değişimi (Piper/Orpheus) `lib/speak.mjs` arkasında gelecek iş.

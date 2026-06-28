# herd-voice v2 (servis-leştirme) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** herd-voice'u yönetilebilir servise çevirmek: `~/.herdr-voice/` app dizini, `herdr-voice` CLI (start/stop/restart/status/logs/enable/disable), launchd startup, rotate'li log, ve `hr`'siz presence-aware "bulunduğun cihazda ses".

**Architecture:** Aynı kod tabanı role'e göre iki daemon: host=`voice-router.mjs`, remote=`voice-sink.mjs` (gömülü presence-watcher). Daemon'lar `/speak`'te config'i taze okur (canlı enabled/voice). install runtime'ı repodan `~/.herdr-voice/src`'a kopyalar, yolları yeniden bağlar, eski v1 kurulumu temizler.

**Tech Stack:** Node.js ESM (sıfır npm bağımlılığı, `node --test`), Bash (CLI + plugin actions + installers), macOS `say`, launchd, Tailscale, herdr.

## Global Constraints

- Node ESM `.mjs`, **sıfır npm bağımlılığı** (yalnız stdlib). Test: `node --test`.
- App dizini: **`~/.herdr-voice/`** → `config.json`, `src/`, `logs/`. Config override env: `HERD_VOICE_CONFIG`.
- CLI: **`herdr-voice`** → `~/.local/bin/herdr-voice` (bash). Alt komutlar: `start stop restart status logs enable disable`.
- launchd label: **`dev.ensar.herdr-voice`**; plist `~/Library/LaunchAgents/dev.ensar.herdr-voice.plist`; `RunAtLoad+KeepAlive`; mutlak node yolu.
- Routing presence-aware: remote sink, `pgrep -f "herdr.*--remote"` (config.remoteHost eşleşmesi) açıkken host router'a register, kapanınca deregister. `bin/hr` **silinir**.
- Daemon `/speak`'te config **taze okunur** (handler'a `getConfig()` enjekte) → enabled/voice/token canlı; port/bind başlangıçta sabit.
- `enabled`: master switch **host config** (Claude hook'ları kontrol eder); sink ayrıca local `enabled`'a saygı (yerel susturma). CLI enable/disable onayı **doğrudan `say`** (gate'siz).
- Log: `~/.herdr-voice/logs/herdr-voice.log`, rotate **~1MB × 5**. Olaylar: START/STOP, SPEAK "<text>", REGISTER/DEREGISTER, FORWARD/FALLBACK, ENABLE/DISABLE.
- plugin id **`ensar.herd-voice`** korunur (keybind churn yok).
- Migrasyon: eski `~/.config/herd-voice/config.json` → `~/.herdr-voice/config.json`'a taşı (token/voice/enabled korunur, role eklenir), eski launchd `dev.ensar.herd-voice.router` + eski config **silinir**.
- Tailscale: host `mac-m4` `100.109.4.84` (MagicDNS `mac-m4-jftf`), remote `mac-m2` `100.111.159.123`. Port 8973.
- Proje kökü (dev): `/Users/ensarkovankaya/Projects/herd-voice`.

## File Structure

```
src/lib/config.mjs        # MODIFY: default yol ~/.herdr-voice; role/remoteHost defaults
src/lib/logger.mjs        # NEW: makeLogger (rotate)
src/lib/presence.mjs      # NEW: decidePresenceAction (saf) + startPresenceWatcher
src/lib/{http,speak,summarize}.mjs   # değişmez
src/voice-sink.mjs        # MODIFY: makeSinkHandler({getConfig,speak,log}) + enabled gate + watcher
src/voice-router.mjs      # MODIFY: makeRouter({getConfig,speak,forward,now,log}) + log
src/{speak-summary,notify-cue}.mjs   # değişmez (config.mjs üzerinden yeni yola otomatik)
bin/herdr-voice           # NEW: CLI (bash)
bin/hr                    # DELETE
launchd/dev.ensar.herdr-voice.plist.tmpl   # NEW (@NODE@/@DAEMON@/@APP@)
launchd/dev.ensar.herd-voice.router.plist.tmpl  # DELETE
plugin/actions/toggle.sh  # MODIFY: config yolu + log satırı
statusline/herd-voice-segment.sh  # MODIFY: config yolu
install.sh                # REWRITE (host v2)
install-remote.sh         # REWRITE (remote v2)
README.md                 # UPDATE
test/{logger,presence}.test.mjs   # NEW
test/{config,voice-sink,voice-router}.test.mjs  # UPDATE
```

## Prerequisites (uygulama başında doğrula)

- [ ] `pgrep -fl herdr` ile gerçek bir `herdr --remote` oturumunun cmdline imzasını gör (presence deseni `herdr.*--remote` eşleşiyor mu).
- [ ] `command -v node jq tailscale say` mevcut; `~/.local/bin` PATH'te (doğrulandı).

______________________________________________________________________

### Task 1: `lib/config.mjs` — yeni yol + role/remoteHost

**Files:** Modify `src/lib/config.mjs`; Modify `test/config.test.mjs`

**Interfaces:**

- Produces: `configPath()` → `~/.herdr-voice/config.json` (env `HERD_VOICE_CONFIG` override). `loadConfig()` → DEFAULTS (eksik dosyada) / merge. DEFAULTS artık `role:'host'`, `remoteHost:''` içerir.

- [ ] **Step 1: Testi güncelle** — `test/config.test.mjs` (missing→defaults bloğuna ekle, ve yeni yol):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, configPath } from '../src/lib/config.mjs';

test('default yol ~/.herdr-voice/config.json', () => {
  delete process.env.HERD_VOICE_CONFIG;
  assert.equal(configPath(), join(homedir(), '.herdr-voice', 'config.json'));
});

test('missing file → defaults (role=host dahil)', () => {
  process.env.HERD_VOICE_CONFIG = join(mkdtempSync(join(tmpdir(), 'hv-')), 'nope.json');
  const c = loadConfig();
  assert.equal(c.port, 8973);
  assert.equal(c.voice, 'Yelda');
  assert.equal(c.enabled, false);
  assert.equal(c.role, 'host');
  assert.equal(c.remoteHost, '');
});

test('partial file merges over defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hv-'));
  const p = join(dir, 'config.json');
  writeFileSync(p, JSON.stringify({ token: 'abc', role: 'remote', remoteHost: 'mac-m4-jftf', port: 9001 }));
  process.env.HERD_VOICE_CONFIG = p;
  const c = loadConfig();
  assert.equal(c.token, 'abc');
  assert.equal(c.role, 'remote');
  assert.equal(c.remoteHost, 'mac-m4-jftf');
  assert.equal(c.port, 9001);
  assert.equal(c.voice, 'Yelda');
});
```

- [ ] **Step 2: Run → fail** — `node --test test/config.test.mjs` (yeni yol/role bekledikleri patlar).

- [ ] **Step 3: `src/lib/config.mjs` güncelle**

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
  role: 'host',
  remoteHost: '',
  remoteTtlMs: 3_600_000,
  forwardTimeoutMs: 1500,
  postTimeoutMs: 1500,
  cue: 'Onayın gerekiyor.',
};

export function configPath() {
  return process.env.HERD_VOICE_CONFIG
    || join(homedir(), '.herdr-voice', 'config.json');
}

export function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(configPath(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}
```

- [ ] **Step 4: Run → pass** — `node --test test/config.test.mjs`.
- [ ] **Step 5: Commit**

```bash
git -C ~/Projects/herd-voice add src/lib/config.mjs test/config.test.mjs
git -C ~/Projects/herd-voice commit -m "feat(config): ~/.herdr-voice path + role/remoteHost"
```

______________________________________________________________________

### Task 2: `lib/logger.mjs` — rotate'li logger

**Files:** Create `src/lib/logger.mjs`, `test/logger.test.mjs`

**Interfaces:**

- Produces: `makeLogger({file, maxBytes?=1_000_000, keep?=5})` → `log(level, msg)`. Yazımdan önce `file > maxBytes` ise rotate (`.log→.log.1`, kaydır, en çok `keep`). Hatalar yutulur (log asla daemon'u düşürmez).

- [ ] **Step 1: Failing test** — `test/logger.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeLogger } from '../src/lib/logger.mjs';

test('yazar ve format içerir', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'hvlog-')), 'a.log');
  makeLogger({ file: f })('INFO', 'merhaba');
  assert.match(readFileSync(f, 'utf8'), /\[INFO\] merhaba/);
});

test('maxBytes aşılınca rotate eder, keep ile sınırlı', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'hvlog-')), 'a.log');
  const log = makeLogger({ file: f, maxBytes: 50, keep: 2 });
  for (let i = 0; i < 20; i++) log('INFO', 'x'.repeat(40) + i);
  assert.ok(existsSync(f));            // güncel dosya var
  assert.ok(existsSync(f + '.1'));     // en az bir rotate
  assert.ok(!existsSync(f + '.3'));    // keep=2 → .3 olmamalı
});
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: `src/lib/logger.mjs` yaz**

```js
import { appendFileSync, statSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function makeLogger({ file, maxBytes = 1_000_000, keep = 5 }) {
  function rotate() {
    try {
      if (!existsSync(file) || statSync(file).size <= maxBytes) return;
      for (let i = keep - 1; i >= 1; i--) {
        if (existsSync(`${file}.${i}`)) renameSync(`${file}.${i}`, `${file}.${i + 1}`);
      }
      renameSync(file, `${file}.1`);
    } catch { /* yut */ }
  }
  return function log(level, msg) {
    try {
      mkdirSync(dirname(file), { recursive: true });
      rotate();
      appendFileSync(file, `[${new Date().toISOString()}] [${level}] ${msg}\n`);
    } catch { /* yut */ }
  };
}
```

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit**

```bash
git -C ~/Projects/herd-voice add src/lib/logger.mjs test/logger.test.mjs
git -C ~/Projects/herd-voice commit -m "feat(logger): size-rotated file logger"
```

______________________________________________________________________

### Task 3: `lib/presence.mjs` — karar fonksiyonu + watcher

**Files:** Create `src/lib/presence.mjs`, `test/presence.test.mjs`

**Interfaces:**

- Produces: `decidePresenceAction({active, registered, lastRegisterMs, now, heartbeatMs})` → `'register'|'deregister'|'noop'` (saf). `startPresenceWatcher({getConfig, log, intervalMs?=7000})` → `interval` döndürür (impure; pgrep + postJson + tailscale ip).

- Consumes: `lib/http.postJson`, `lib/config`.

- [ ] **Step 1: Failing test** — `test/presence.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidePresenceAction } from '../src/lib/presence.mjs';

const H = 30_000;
test('aktif & kayıtsız → register', () => {
  assert.equal(decidePresenceAction({ active: true, registered: false, lastRegisterMs: 0, now: 0, heartbeatMs: H }), 'register');
});
test('aktif & kayıtlı & heartbeat zamanı → register', () => {
  assert.equal(decidePresenceAction({ active: true, registered: true, lastRegisterMs: 0, now: 40_000, heartbeatMs: H }), 'register');
});
test('aktif & kayıtlı & taze → noop', () => {
  assert.equal(decidePresenceAction({ active: true, registered: true, lastRegisterMs: 0, now: 10_000, heartbeatMs: H }), 'noop');
});
test('pasif & kayıtlı → deregister', () => {
  assert.equal(decidePresenceAction({ active: false, registered: true, lastRegisterMs: 0, now: 0, heartbeatMs: H }), 'deregister');
});
test('pasif & kayıtsız → noop', () => {
  assert.equal(decidePresenceAction({ active: false, registered: false, lastRegisterMs: 0, now: 0, heartbeatMs: H }), 'noop');
});
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: `src/lib/presence.mjs` yaz**

```js
import { execFileSync } from 'node:child_process';
import { postJson } from './http.mjs';

export function decidePresenceAction({ active, registered, lastRegisterMs, now, heartbeatMs }) {
  if (active && (!registered || now - lastRegisterMs >= heartbeatMs)) return 'register';
  if (!active && registered) return 'deregister';
  return 'noop';
}

function pgrepHerdrRemote(remoteHost) {
  try {
    const out = execFileSync('pgrep', ['-fl', 'herdr'], { encoding: 'utf8' });
    return out.split('\n').some((l) =>
      /--remote/.test(l) && (!remoteHost || l.includes(remoteHost)));
  } catch { return false; }
}

function myTailscaleIp() {
  try { return execFileSync('tailscale', ['ip', '-4'], { encoding: 'utf8' }).split('\n')[0].trim(); }
  catch { return ''; }
}

export function startPresenceWatcher({ getConfig, log, intervalMs = 7000, heartbeatMs = 30_000 }) {
  let registered = false;
  let lastRegisterMs = 0;
  const ip = myTailscaleIp();
  const tick = async () => {
    const cfg = getConfig();
    const active = pgrepHerdrRemote(cfg.remoteHost);
    const action = decidePresenceAction({ active, registered, lastRegisterMs, now: Date.now(), heartbeatMs });
    const base = `http://${cfg.host}:${cfg.port}`;
    try {
      if (action === 'register') {
        await postJson(`${base}/register`, { ip, port: cfg.port }, { token: cfg.token, timeoutMs: cfg.postTimeoutMs });
        if (!registered) log('INFO', `REGISTER ${ip}:${cfg.port} -> ${base}`);
        registered = true; lastRegisterMs = Date.now();
      } else if (action === 'deregister') {
        await postJson(`${base}/deregister`, {}, { token: cfg.token, timeoutMs: cfg.postTimeoutMs });
        log('INFO', `DEREGISTER -> ${base}`);
        registered = false;
      }
    } catch (e) { log('WARN', `presence ${action} failed: ${e.message}`); }
  };
  const handle = setInterval(tick, intervalMs);
  tick();
  return handle;
}
```

- [ ] **Step 4: Run → pass** (`node --test test/presence.test.mjs`; watcher impure kısmı manuel/entegrasyonda doğrulanır).
- [ ] **Step 5: Commit**

```bash
git -C ~/Projects/herd-voice add src/lib/presence.mjs test/presence.test.mjs
git -C ~/Projects/herd-voice commit -m "feat(presence): decide fn + herdr --remote watcher (register/deregister)"
```

______________________________________________________________________

### Task 4: `voice-sink.mjs` — getConfig + enabled gate + log + watcher

**Files:** Modify `src/voice-sink.mjs`; Modify `test/voice-sink.test.mjs`

**Interfaces:**

- Produces: `makeSinkHandler({getConfig, speak, log})` → handler. `/health`→200. `/speak`: `cfg=getConfig()`; token≠cfg.token→401; `!cfg.enabled`→200 `{skipped:true}` (+log "SPEAK skipped"); else 202 + log `SPEAK "<text>"` + `speak(text,{voice:cfg.voice})`.

- Consumes: `lib/config.loadConfig`, `lib/http`, `lib/speak`, `lib/logger`, `lib/presence.startPresenceWatcher`.

- [ ] **Step 1: Testi güncelle** — `test/voice-sink.test.mjs`

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
const noLog = () => {};

test('doğru token + enabled → 202 ve fresh voice ile speak', async () => {
  const spoken = [];
  const getConfig = () => ({ token: 'T', voice: 'Yelda (Enhanced)', enabled: true });
  const { s, port } = await start(makeSinkHandler({ getConfig, speak: (t, o) => spoken.push([t, o.voice]), log: noLog }));
  const r = await postJson(`http://127.0.0.1:${port}/speak`, { text: 'selam' }, { token: 'T' });
  assert.equal(r.status, 202);
  assert.deepEqual(spoken, [['selam', 'Yelda (Enhanced)']]);
  s.close();
});

test('enabled=false → speak çağrılmaz', async () => {
  const spoken = [];
  const getConfig = () => ({ token: 'T', voice: 'Yelda', enabled: false });
  const { s, port } = await start(makeSinkHandler({ getConfig, speak: (t) => spoken.push(t), log: noLog }));
  const r = await postJson(`http://127.0.0.1:${port}/speak`, { text: 'x' }, { token: 'T' });
  assert.equal(r.status, 200);
  assert.equal(spoken.length, 0);
  s.close();
});

test('yanlış token → 401', async () => {
  const getConfig = () => ({ token: 'T', voice: 'Yelda', enabled: true });
  const { s, port } = await start(makeSinkHandler({ getConfig, speak: () => {}, log: noLog }));
  const r = await postJson(`http://127.0.0.1:${port}/speak`, { text: 'x' }, { token: 'WRONG' });
  assert.equal(r.status, 401);
  s.close();
});
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: `src/voice-sink.mjs` yaz**

```js
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { readJsonBody, sendJson } from './lib/http.mjs';
import { speak as realSpeak } from './lib/speak.mjs';
import { makeLogger } from './lib/logger.mjs';
import { startPresenceWatcher } from './lib/presence.mjs';

export function makeSinkHandler({ getConfig, speak, log }) {
  return async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true });
    if (req.method === 'POST' && req.url === '/speak') {
      const cfg = getConfig();
      if ((req.headers['x-voice-token'] || '') !== cfg.token) return sendJson(res, 401, { error: 'unauthorized' });
      let body;
      try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { error: 'bad json' }); }
      if (!cfg.enabled) { log('INFO', 'SPEAK skipped (disabled)'); return sendJson(res, 200, { skipped: true }); }
      sendJson(res, 202, { ok: true });
      log('INFO', `SPEAK "${(body.text || '').slice(0, 200)}"`);
      speak(body.text, { voice: cfg.voice });
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  };
}

function main() {
  const logFile = join(homedir(), '.herdr-voice', 'logs', 'herdr-voice.log');
  const log = makeLogger({ file: logFile });
  const bind = process.env.HERD_VOICE_BIND || '0.0.0.0';
  const cfg0 = loadConfig();
  const handler = makeSinkHandler({ getConfig: loadConfig, speak: realSpeak, log });
  http.createServer(handler).listen(cfg0.port, bind, () => log('INFO', `START voice-sink ${bind}:${cfg0.port}`));
  startPresenceWatcher({ getConfig: loadConfig, log });
  process.on('SIGTERM', () => { log('INFO', 'STOP voice-sink'); process.exit(0); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit**

```bash
git -C ~/Projects/herd-voice add src/voice-sink.mjs test/voice-sink.test.mjs
git -C ~/Projects/herd-voice commit -m "feat(sink): getConfig (live voice/enabled) + enabled gate + logging + presence watcher"
```

______________________________________________________________________

### Task 5: `voice-router.mjs` — getConfig + log

**Files:** Modify `src/voice-router.mjs`; Modify `test/voice-router.test.mjs`

**Interfaces:**

- Produces: `makeRouter({getConfig, speak, forward, now, log})`. `/register {ip,port?,ttlMs?}` (cfg.token, TTL cfg.remoteTtlMs) → set remote; 400 ip yoksa. `/deregister`. `/speak`: token=cfg.token; 202; route: remote canlı → `forward(ip,port,text)` (log FORWARD) hata→remote temizle+`speak(text,{voice:cfg.voice})` (log FALLBACK); yoksa `speak` (log SPEAK). `/health`. **enabled gate YOK** (toggle onayı router'dan geçer, duyulmalı).

- Consumes: `lib/config.loadConfig`, `lib/http`, `lib/speak`, `lib/logger`.

- [ ] **Step 1: Testi güncelle** — `test/voice-router.test.mjs` (getConfig'li; mevcut 5 senaryo + fresh voice)

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
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: `src/voice-router.mjs` yaz**

```js
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { readJsonBody, sendJson, postJson } from './lib/http.mjs';
import { speak as realSpeak } from './lib/speak.mjs';
import { makeLogger } from './lib/logger.mjs';

export function makeRouter({ getConfig, speak, forward, now = Date.now, log }) {
  let remote = null; // {ip, port, expiresAt}

  function route(text, cfg) {
    if (remote && now() < remote.expiresAt) {
      const { ip, port } = remote;
      log('INFO', `FORWARD "${(text || '').slice(0, 120)}" -> ${ip}:${port}`);
      Promise.resolve()
        .then(() => forward(ip, port, text))
        .catch(() => { remote = null; log('WARN', `FALLBACK local (forward ${ip}:${port} failed)`); speak(text, { voice: cfg.voice }); });
    } else {
      log('INFO', `SPEAK "${(text || '').slice(0, 120)}" (local)`);
      speak(text, { voice: cfg.voice });
    }
  }

  return async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true });
    if (req.method !== 'POST') return sendJson(res, 404, { error: 'not found' });
    const cfg = getConfig();
    if ((req.headers['x-voice-token'] || '') !== cfg.token) return sendJson(res, 401, { error: 'unauthorized' });
    let body;
    try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { error: 'bad json' }); }

    if (req.url === '/register') {
      if (!body.ip) return sendJson(res, 400, { error: 'ip required' });
      remote = { ip: body.ip, port: body.port || 8973, expiresAt: now() + (body.ttlMs || cfg.remoteTtlMs) };
      log('INFO', `REGISTER ${remote.ip}:${remote.port}`);
      return sendJson(res, 200, { ok: true, remote: { ip: remote.ip, port: remote.port } });
    }
    if (req.url === '/deregister') { remote = null; log('INFO', 'DEREGISTER'); return sendJson(res, 200, { ok: true }); }
    if (req.url === '/speak') { sendJson(res, 202, { ok: true }); route(body.text, cfg); return; }
    return sendJson(res, 404, { error: 'not found' });
  };
}

function main() {
  const logFile = join(homedir(), '.herdr-voice', 'logs', 'herdr-voice.log');
  const log = makeLogger({ file: logFile });
  const bind = process.env.HERD_VOICE_BIND || '0.0.0.0';
  const cfg0 = loadConfig();
  const forward = (ip, port, text) =>
    postJson(`http://${ip}:${port}/speak`, { text }, { token: loadConfig().token, timeoutMs: loadConfig().forwardTimeoutMs })
      .then((r) => { if (r.status >= 300) throw new Error(`sink ${r.status}`); });
  const handler = makeRouter({ getConfig: loadConfig, speak: realSpeak, forward, now: Date.now, log });
  http.createServer(handler).listen(cfg0.port, bind, () => log('INFO', `START voice-router ${bind}:${cfg0.port}`));
  process.on('SIGTERM', () => { log('INFO', 'STOP voice-router'); process.exit(0); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 4: Run → pass** (full suite: `node --test`).
- [ ] **Step 5: Commit**

```bash
git -C ~/Projects/herd-voice add src/voice-router.mjs test/voice-router.test.mjs
git -C ~/Projects/herd-voice commit -m "feat(router): getConfig (live voice/token) + structured logging"
```

______________________________________________________________________

### Task 6: `bin/herdr-voice` CLI + `bin/hr` sil

**Files:** Create `bin/herdr-voice`; Delete `bin/hr`

**Interfaces:** CLI `~/.herdr-voice/config.json` (role/voice/enabled) + launchd `dev.ensar.herdr-voice` yönetir. Komutlar: start/stop/restart/status/logs/enable/disable.

- [ ] **Step 1: `bin/herdr-voice` yaz**

```bash
#!/usr/bin/env bash
set -euo pipefail
APP="$HOME/.herdr-voice"
CFG="$APP/config.json"
LOG="$APP/logs/herdr-voice.log"
LABEL="dev.ensar.herdr-voice"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_N="$(id -u)"

die(){ echo "herdr-voice: $*" >&2; exit 1; }
[ -f "$CFG" ] || die "config yok: $CFG (önce install çalıştır)"
role(){ jq -r '.role // "host"' "$CFG"; }
voice(){ jq -r '.voice // "Yelda"' "$CFG"; }

case "${1:-status}" in
  start)   launchctl load -w "$PLIST"; echo "started ($(role))" ;;
  stop)    launchctl unload -w "$PLIST"; echo "stopped" ;;
  restart) launchctl kickstart -k "gui/$UID_N/$LABEL"; echo "restarted" ;;
  status)
    if launchctl list 2>/dev/null | grep -q "$LABEL"; then st="çalışıyor"; else st="durdu"; fi
    echo "herdr-voice: $st | role=$(role) | enabled=$(jq -r '.enabled // false' "$CFG") | voice=$(voice)"
    [ "$(role)" = "remote" ] && echo "son kayıt: $(grep -E 'REGISTER|DEREGISTER' "$LOG" 2>/dev/null | tail -1 || echo '-')"
    echo "--- son log ---"; tail -n 10 "$LOG" 2>/dev/null || echo "(log yok)" ;;
  logs)    tail -f "$LOG" ;;
  enable|disable)
    new=$([ "$1" = enable ] && echo true || echo false)
    tmp=$(mktemp); jq --argjson e "$new" '.enabled=$e' "$CFG" > "$tmp" && mv -f "$tmp" "$CFG"
    printf '[%s] [INFO] %s (cli)\n' "$(date -u +%FT%TZ)" "$([ "$new" = true ] && echo ENABLE || echo DISABLE)" >> "$LOG"
    say -v "$(voice)" "$([ "$new" = true ] && echo 'Ses açıldı' || echo 'Ses kapandı')" 2>/dev/null || true
    echo "enabled=$new" ;;
  *) die "kullanım: herdr-voice {start|stop|restart|status|logs|enable|disable}" ;;
esac
```

- [ ] **Step 2: Çalıştırılabilir + syntax**

```bash
chmod +x ~/Projects/herd-voice/bin/herdr-voice
bash -n ~/Projects/herd-voice/bin/herdr-voice && echo "syntax ok"
```

- [ ] **Step 3: `bin/hr` sil**

```bash
git -C ~/Projects/herd-voice rm bin/hr
```

- [ ] **Step 4: Commit**

```bash
git -C ~/Projects/herd-voice add bin/herdr-voice
git -C ~/Projects/herd-voice commit -m "feat(cli): herdr-voice start/stop/restart/status/logs/enable/disable; remove bin/hr"
```

______________________________________________________________________

### Task 7: launchd şablonu + toggle.sh & statusline yol güncelle

**Files:** Create `launchd/dev.ensar.herdr-voice.plist.tmpl`; Delete `launchd/dev.ensar.herd-voice.router.plist.tmpl`; Modify `plugin/actions/toggle.sh`, `statusline/herd-voice-segment.sh`

- [ ] **Step 1: `launchd/dev.ensar.herdr-voice.plist.tmpl` yaz** (`@NODE@`,`@APP@`,`@DAEMON@` install doldurur; `@DAEMON@`=`voice-router.mjs` veya `voice-sink.mjs`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>dev.ensar.herdr-voice</string>
  <key>ProgramArguments</key>
  <array>
    <string>@NODE@</string>
    <string>@APP@/src/@DAEMON@</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>HERD_VOICE_BIND</key><string>0.0.0.0</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>@APP@/logs/launchd.out.log</string>
  <key>StandardErrorPath</key><string>@APP@/logs/launchd.err.log</string>
</dict>
</plist>
```

- [ ] **Step 2: `plugin/actions/toggle.sh` güncelle** (config yolu + log)

```bash
#!/usr/bin/env bash
set -euo pipefail
CFG="${HERD_VOICE_CONFIG:-$HOME/.herdr-voice/config.json}"
LOG="$HOME/.herdr-voice/logs/herdr-voice.log"
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
if [ "$new" = "true" ]; then printf '\033]0;🔈 herd-voice on\007'; msg="Ses açıldı"; else printf '\033]0;herd-voice off\007'; msg="Ses kapandı"; fi
printf '[%s] [INFO] %s (toggle)\n' "$(date -u +%FT%TZ)" "$([ "$new" = true ] && echo ENABLE || echo DISABLE)" >> "$LOG" 2>/dev/null || true
TOKEN=$(jq -r '.token // ""' "$CFG"); HOST=$(jq -r '.host // "127.0.0.1"' "$CFG"); PORT=$(jq -r '.port // 8973' "$CFG")
if [ -n "$TOKEN" ]; then
  curl -fsS -m 2 -X POST "http://${HOST}:${PORT}/speak" \
    -H "x-voice-token: $TOKEN" -H 'content-type: application/json' \
    -d "{\"text\":\"$msg\"}" >/dev/null 2>&1 || true
fi
echo "herd-voice enabled=$new"
```

- [ ] **Step 3: `statusline/herd-voice-segment.sh` güncelle** (yol)

```bash
#!/usr/bin/env bash
# herd-voice statusLine segmenti — ses açık/kapalı göstergesi. Çıktı: "🔈 ses" / "🔇 ses".
hv=$(jq -r '.enabled // false' "${HERD_VOICE_CONFIG:-$HOME/.herdr-voice/config.json}" 2>/dev/null)
if [ "$hv" = "true" ]; then printf '🔈 ses'; else printf '🔇 ses'; fi
```

- [ ] **Step 4: Eski plist sil + syntax**

```bash
git -C ~/Projects/herd-voice rm launchd/dev.ensar.herd-voice.router.plist.tmpl
bash -n ~/Projects/herd-voice/plugin/actions/toggle.sh && bash -n ~/Projects/herd-voice/statusline/herd-voice-segment.sh && echo "syntax ok"
```

- [ ] **Step 5: Commit**

```bash
git -C ~/Projects/herd-voice add launchd/ plugin/actions/toggle.sh statusline/herd-voice-segment.sh
git -C ~/Projects/herd-voice commit -m "feat: role-agnostic launchd tmpl; toggle/statusline -> ~/.herdr-voice + log"
```

______________________________________________________________________

### Task 8: `install.sh` v2 (host)

**Files:** Rewrite `install.sh`

**Davranış:** ~/.herdr-voice kur (src kopyala, config migrate role=host) → CLI ~/.local/bin → launchd router → Claude hook'ları + statusline + plugin yeniden bağla → eski v1 temizle. **CREATE-AND-SYNTAX-CHECK ONLY** (implementer çalıştırmaz; kullanıcı çalıştırır).

- [ ] **Step 1: `install.sh` yaz**

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$(command -v node)"
APP="$HOME/.herdr-voice"
CFG="$APP/config.json"
OLD_CFG="$HOME/.config/herd-voice/config.json"
SETTINGS="$HOME/.claude/settings.json"
LABEL="dev.ensar.herdr-voice"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
BIN="$HOME/.local/bin/herdr-voice"

echo "node: $NODE"; herdr --version

# 1) app dizini + src kopyala
mkdir -p "$APP/src" "$APP/logs"
cp -R "$ROOT/src/." "$APP/src/"

# 2) config: migrate (eski varsa) / üret; role=host
if [ ! -f "$CFG" ]; then
  if [ -f "$OLD_CFG" ]; then
    TOKEN=$(jq -r '.token // ""' "$OLD_CFG"); VOICE=$(jq -r '.voice // "Yelda"' "$OLD_CFG"); EN=$(jq -r '.enabled // true' "$OLD_CFG")
  else TOKEN=""; VOICE="Yelda"; EN=true; fi
  [ -n "$TOKEN" ] || TOKEN="$(openssl rand -hex 16)"
  jq -n --arg t "$TOKEN" --arg v "$VOICE" --argjson en "$EN" \
    '{token:$t, host:"127.0.0.1", port:8973, voice:$v, enabled:$en, role:"host", remoteHost:"", remoteTtlMs:3600000, forwardTimeoutMs:1500, postTimeoutMs:1500, cue:"Onayın gerekiyor."}' > "$CFG"
  echo "config yazıldı/migrate edildi: $CFG"
else
  # token eksikse üret + role host garanti
  if [ -z "$(jq -r '.token // ""' "$CFG")" ]; then TOKEN="$(openssl rand -hex 16)"; tmp=$(mktemp); jq --arg t "$TOKEN" '.token=$t' "$CFG" > "$tmp" && mv "$tmp" "$CFG"; fi
  tmp=$(mktemp); jq '.role="host"' "$CFG" > "$tmp" && mv "$tmp" "$CFG"
  echo "config zaten var: $CFG"
fi

# 3) CLI -> ~/.local/bin
mkdir -p "$HOME/.local/bin"; cp "$ROOT/bin/herdr-voice" "$BIN"; chmod +x "$BIN"
echo "CLI: $BIN"

# 4) launchd router
sed -e "s#@NODE@#$NODE#g" -e "s#@APP@#$APP#g" -e "s#@DAEMON@#voice-router.mjs#g" \
  "$ROOT/launchd/dev.ensar.herdr-voice.plist.tmpl" > "$PLIST"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load -w "$PLIST"; sleep 1
curl -fsS "http://127.0.0.1:8973/health" >/dev/null 2>&1 && echo "router up" || echo "router health FAIL"

# 5) Claude hook'ları -> ~/.herdr-voice/src (eski herd-voice girdileri temizlenir, idempotent)
CMD_STOP="\"$NODE\" \"$APP/src/speak-summary.mjs\""
CMD_NOTIFY="\"$NODE\" \"$APP/src/notify-cue.mjs\""
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
tmp=$(mktemp)
jq --arg stop "$CMD_STOP" --arg notify "$CMD_NOTIFY" '
  .hooks = (.hooks // {})
  | .hooks.Stop = ((.hooks.Stop // []) | map(select(((.hooks[]?.command) // "") | test("herd-?voice") | not)))
  | .hooks.Notification = ((.hooks.Notification // []) | map(select(((.hooks[]?.command) // "") | test("herd-?voice") | not)))
  | .hooks.Stop += [{"hooks":[{"type":"command","command":$stop}]}]
  | .hooks.Notification += [{"matcher":"permission_prompt|idle_prompt","hooks":[{"type":"command","command":$notify}]}]
' "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
echo "Claude hook'ları ~/.herdr-voice/src'a bağlandı"

# 6) plugin (manifest üret + link) + toggle yeni config'i kullanır
sed -e "s#@ROOT@#$ROOT#g" "$ROOT/plugin/herdr-plugin.toml.tmpl" > "$ROOT/plugin/herdr-plugin.toml"
herdr plugin link "$ROOT/plugin" >/dev/null 2>&1 || echo "uyarı: herdr plugin link"

# 7) eski v1 temizliği
launchctl unload "$HOME/Library/LaunchAgents/dev.ensar.herd-voice.router.plist" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/dev.ensar.herd-voice.router.plist"
rm -rf "$HOME/.config/herd-voice"
echo "eski v1 (launchd + ~/.config/herd-voice) temizlendi"

echo "Bitti. 'herdr-voice status' ile kontrol et. statusLine + keybind v1'den aynen geçerli."
```

- [ ] **Step 2: Syntax + commit** (çalıştırma yok)

```bash
bash -n ~/Projects/herd-voice/install.sh && echo "syntax ok"

# hook-rewire jq filtresini GÜVENLİ doğrula (gerçek settings.json'a dokunma):
# eski herd-voice hook'u + SessionStart/PostToolUse içeren örnekte → eskiler korunur, herd-voice tekilleşir
S=$(mktemp)
echo '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"keep-ss"}]}],"PostToolUse":[{"matcher":"Write","hooks":[{"type":"command","command":"fmt"}]}],"Stop":[{"hooks":[{"type":"command","command":"\"/old/node\" \"/x/herd-voice/src/speak-summary.mjs\""}]}]}}' > "$S"
FILTER='.hooks=(.hooks//{}) | .hooks.Stop=((.hooks.Stop//[])|map(select(((.hooks[]?.command)//"")|test("herd-?voice")|not))) | .hooks.Notification=((.hooks.Notification//[])|map(select(((.hooks[]?.command)//"")|test("herd-?voice")|not))) | .hooks.Stop+=[{"hooks":[{"type":"command","command":"NEWSTOP"}]}] | .hooks.Notification+=[{"matcher":"permission_prompt|idle_prompt","hooks":[{"type":"command","command":"NEWNOTIF"}]}]'
jq "$FILTER" "$S" > "$S.out"
echo "SessionStart korundu (keep-ss): $(jq -r '.hooks.SessionStart[0].hooks[0].command' "$S.out")"
echo "PostToolUse korundu (fmt): $(jq -r '.hooks.PostToolUse[0].hooks[0].command' "$S.out")"
echo "Stop herd-voice tekil (1, =NEWSTOP): $(jq -r '.hooks.Stop|length' "$S.out") / $(jq -r '.hooks.Stop[-1].hooks[0].command' "$S.out")"
# Beklenen: keep-ss, fmt, 1, NEWSTOP

git -C ~/Projects/herd-voice add install.sh
git -C ~/Projects/herd-voice commit -m "feat(install): v2 host (app dir, CLI, launchd, hook/plugin rewire, v1 migrate+cleanup)"
```

______________________________________________________________________

### Task 9: `install-remote.sh` v2 + README

**Files:** Rewrite `install-remote.sh`; Update `README.md`

**Davranış:** remote (mac-m2) — ~/.herdr-voice kur (role=remote), src kopyala, CLI, launchd sink+watcher, eski temizle. Claude hook/plugin YOK. **CREATE-AND-SYNTAX-CHECK ONLY.**

- [ ] **Step 1: `install-remote.sh` yaz**

```bash
#!/usr/bin/env bash
set -euo pipefail
# Kullanım: install-remote.sh <HOST_TS_IP> <TOKEN> [REMOTE_HOST=mac-m4-jftf]
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$(command -v node)"
HOST_IP="${1:?host Tailscale IP gerekli}"; TOKEN="${2:?token gerekli}"; RHOST="${3:-mac-m4-jftf}"
APP="$HOME/.herdr-voice"; CFG="$APP/config.json"
LABEL="dev.ensar.herdr-voice"; PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"; BIN="$HOME/.local/bin/herdr-voice"

mkdir -p "$APP/src" "$APP/logs"; cp -R "$ROOT/src/." "$APP/src/"
# voice korunur (varsa), yoksa Yelda
VOICE=$(jq -r '.voice // "Yelda"' "$CFG" 2>/dev/null || echo Yelda)
jq -n --arg t "$TOKEN" --arg h "$HOST_IP" --arg r "$RHOST" --arg v "$VOICE" \
  '{token:$t, host:$h, port:8973, voice:$v, enabled:true, role:"remote", remoteHost:$r, remoteTtlMs:3600000, forwardTimeoutMs:1500, postTimeoutMs:1500, cue:"Onayın gerekiyor."}' > "$CFG"
mkdir -p "$HOME/.local/bin"; cp "$ROOT/bin/herdr-voice" "$BIN"; chmod +x "$BIN"
sed -e "s#@NODE@#$NODE#g" -e "s#@APP@#$APP#g" -e "s#@DAEMON@#voice-sink.mjs#g" \
  "$ROOT/launchd/dev.ensar.herdr-voice.plist.tmpl" > "$PLIST"
launchctl unload "$PLIST" 2>/dev/null || true; launchctl load -w "$PLIST"
# eski temizlik
rm -rf "$HOME/.config/herd-voice"
echo "remote kuruldu (role=remote, host=$HOST_IP, remoteHost=$RHOST). 'herdr-voice status'."
echo "Kullanım: herdr --remote $RHOST  (ses otomatik bu cihaza gelir; hr GEREKMEZ)"
```

- [ ] **Step 2: README.md güncelle** — v2 bölümleri: kurulum (host `./install.sh`, remote `./install-remote.sh <ip> <token>`), **CLI** (`herdr-voice start/stop/restart/status/logs/enable/disable`), **presence-aware** (`herdr --remote` yeter, hr yok), app dizini `~/.herdr-voice/`, log/rotate, statusLine, sorun giderme (`herdr-voice status`, `herdr-voice logs`). (v1 README'yi bu yapıya göre revize et; `bin/hr` ve `~/.config/herd-voice` referanslarını kaldır.)

- [ ] **Step 3: Syntax + commit**

```bash
bash -n ~/Projects/herd-voice/install-remote.sh && echo "syntax ok"
git -C ~/Projects/herd-voice add install-remote.sh README.md
git -C ~/Projects/herd-voice commit -m "feat(install-remote): v2 (role=remote sink+watcher); README v2"
```

______________________________________________________________________

## Bilinen kısıtlar / notlar

- Presence pgrep tabanlı; `herdr --remote` cmdline imzası macOS/herdr sürümüne göre değişebilir (Prerequisites'ta doğrula).
- CLI `enable/disable` çalıştığı makinenin local config'ini değiştirir; master switch host'ta.
- Aynı anda iki remote attach → son register kazanır (v1 ile aynı).
- Ses motoru hâlâ `say` (Enhanced). Piper/Orpheus/bulut ayrı iş.

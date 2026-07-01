import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, setEnabled as setEnabledConfig } from './lib/config.mjs';
import { readJsonBody, sendJson, postJson } from './lib/http.mjs';
import { makeSpeaker } from './lib/tts/index.mjs';
import { makeLogger } from './lib/logger.mjs';
import { makeEventHub, makeStreamingLog, STREAM_EVENTS } from './lib/events.mjs';
import { loadHistory, appendHistory } from './lib/history.mjs';

// Build the host's HTTP request handler. Holds the currently-registered remote
// sink (if any), a ring buffer of recent utterances, and an SSE event hub.
export function makeRouter({
  getConfig, speak, forward, now = Date.now, log,
  hub = makeEventHub(),
  persist = () => {},
  initialHistory = [],
  setEnabled = setEnabledConfig,
  ringSize = 50, textCap = 500,
}) {
  let remote = null; // {ip, port, expiresAt}
  let seq = 0;
  const messages = initialHistory.slice(-ringSize);

  // Append an utterance to the ring buffer, persist it, and push it to SSE clients.
  function record(entry) {
    messages.push(entry);
    while (messages.length > ringSize) messages.shift();
    persist(entry);
    hub.broadcast('speak', entry);
  }

  // Forward to the registered remote sink while its registration is live;
  // otherwise — or if forwarding fails — speak locally. Records either way.
  function route(text, cfg, meta) {
    const m = meta || {};
    // Forward only the session/herd fields to the remote sink; kind/cueKind are
    // host-local metadata for the ring buffer + SSE, never sent over the wire
    // (keeps the forward payload shape unchanged — backward compatible).
    const fwdMeta = { sessionId: m.sessionId, sessionTitle: m.sessionTitle, workspace: m.workspace, tab: m.tab, pane: m.pane };
    const capped = (text || '').slice(0, textCap);
    let mode; let provider;
    if (remote && now() < remote.expiresAt) {
      const { ip, port } = remote;
      mode = 'remote'; provider = null;
      const target = `${ip}:${port}`;
      log('INFO', 'forward', { text: capped.slice(0, 120), target, ...m });
      Promise.resolve()
        .then(() => forward(ip, port, text, fwdMeta))
        .catch(() => { remote = null; log('WARN', 'fallback_local', { target, ...m }); speak(text); });
    } else {
      provider = cfg.tts?.providers?.[0] || cfg.tts?.provider || 'say';
      mode = 'local';
      log('INFO', 'speak', { text: capped.slice(0, 120), mode: 'local', provider, voice: cfg.tts?.[provider]?.voice, ...m });
      speak(text);
    }
    record({
      id: `${now()}-${++seq}`,
      ts: new Date(now()).toISOString(),
      text: capped,
      kind: m.kind || 'summary',
      cueKind: m.cueKind || null,
      sessionId: m.sessionId || '',
      sessionTitle: m.sessionTitle || '',
      workspace: m.workspace || '',
      tab: m.tab || '',
      pane: m.pane || '',
      mode,
      provider,
    });
  }

  function snapshot(cfg) {
    const live = remote && now() < remote.expiresAt;
    return {
      enabled: !!cfg.enabled,
      sessionDefault: cfg.sessionDefault || 'on',
      muteFocusedPane: !!cfg.muteFocusedPane,
      language: cfg.language || 'en',
      remote: live ? { present: true, ip: remote.ip, port: remote.port, expiresAt: remote.expiresAt } : { present: false },
      tts: { provider: cfg.tts?.provider, providers: cfg.tts?.providers || [] },
      messages: messages.slice(),
    };
  }

  function openSse(req, res) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(': connected\n\n');
    hub.add(res);
    const ka = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* dropped on next broadcast */ } }, 20_000);
    ka.unref?.();
    req.on('close', () => { clearInterval(ka); hub.remove(res); });
  }

  return async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true });
    const cfg = getConfig();
    if ((req.headers['x-voice-token'] || '') !== cfg.token) return sendJson(res, 401, { error: 'unauthorized' });

    if (req.method === 'GET' && req.url === '/state') return sendJson(res, 200, snapshot(cfg));
    if (req.method === 'GET' && req.url === '/events') return openSse(req, res);

    if (req.method !== 'POST') return sendJson(res, 404, { error: 'not found' });
    let body;
    try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { error: 'bad json' }); }

    if (req.url === '/register') {
      if (!body.ip) return sendJson(res, 400, { error: 'ip required' });
      remote = { ip: body.ip, port: body.port || 8973, expiresAt: now() + (body.ttlMs || cfg.remoteTtlMs) };
      log('INFO', 'register', { ip: remote.ip, port: remote.port });
      return sendJson(res, 200, { ok: true, remote: { ip: remote.ip, port: remote.port } });
    }
    if (req.url === '/deregister') { remote = null; log('INFO', 'deregister'); return sendJson(res, 200, { ok: true }); }
    if (req.url === '/speak') {
      sendJson(res, 202, { ok: true });
      route(body.text, cfg, { sessionId: body.sessionId, sessionTitle: body.sessionTitle, workspace: body.workspace, tab: body.tab, pane: body.pane, kind: body.kind, cueKind: body.cueKind });
      return;
    }
    if (req.url === '/toggle') {
      const newEnabled = !cfg.enabled;
      setEnabled(newEnabled);
      log('INFO', 'toggle', { enabled: newEnabled, source: 'app' });
      if (newEnabled) route(cfg.voiceOnText, cfg, { kind: 'summary' });
      return sendJson(res, 200, { enabled: newEnabled });
    }
    return sendJson(res, 404, { error: 'not found' });
  };
}

// Daemon entry: start the router HTTP server with a local speaker, a forwarder
// that POSTs to the registered remote sink, an SSE hub, and persisted history.
function main() {
  const dir = join(homedir(), '.herdr-voice');
  const logFile = join(dir, 'logs', 'herdr-voice.log');
  const historyFile = join(dir, 'history.jsonl');
  const hub = makeEventHub();
  const log = makeStreamingLog(makeLogger({ file: logFile }), hub, STREAM_EVENTS);
  const bind = process.env.HERD_VOICE_BIND || '0.0.0.0';
  const cfg0 = loadConfig();
  const initialHistory = loadHistory(historyFile, { max: 50 });
  const forward = (ip, port, text, meta = {}) => {
    const c = loadConfig();
    return postJson(`http://${ip}:${port}/speak`, { text, ...meta }, { token: c.token, timeoutMs: c.forwardTimeoutMs })
      .then((r) => { if (r.status >= 300) throw new Error(`sink ${r.status}`); });
  };
  const handler = makeRouter({
    getConfig: loadConfig,
    speak: makeSpeaker({ getConfig: loadConfig, log }),
    forward, now: Date.now, log, hub,
    initialHistory,
    persist: (entry) => appendHistory(historyFile, entry),
    setEnabled: setEnabledConfig,
  });
  http.createServer(handler).listen(cfg0.port, bind, () => log('INFO', 'start', { service: 'voice-router', bind, port: cfg0.port }));
  process.on('SIGTERM', () => { log('INFO', 'stop', { service: 'voice-router' }); process.exit(0); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

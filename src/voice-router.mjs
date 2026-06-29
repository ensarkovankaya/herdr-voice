import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { readJsonBody, sendJson, postJson } from './lib/http.mjs';
import { makeSpeaker } from './lib/tts/index.mjs';
import { makeLogger } from './lib/logger.mjs';

// Build the host's HTTP request handler. Holds the currently-registered remote
// sink (if any) and routes each utterance either to it or to local TTS.
export function makeRouter({ getConfig, speak, forward, now = Date.now, log }) {
  let remote = null; // {ip, port, expiresAt}

  // Forward to the registered remote sink while its registration is live;
  // otherwise — or if forwarding fails — speak locally.
  function route(text, cfg, meta) {
    const m = meta || {};
    if (remote && now() < remote.expiresAt) {
      const { ip, port } = remote;
      const target = `${ip}:${port}`;
      log('INFO', 'forward', { text: (text || '').slice(0, 120), target, ...m });
      Promise.resolve()
        .then(() => forward(ip, port, text, meta))
        .catch(() => { remote = null; log('WARN', 'fallback_local', { target, ...m }); speak(text); });
    } else {
      log('INFO', 'speak', { text: (text || '').slice(0, 120), mode: 'local', ...m });
      speak(text);
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
      log('INFO', 'register', { ip: remote.ip, port: remote.port });
      return sendJson(res, 200, { ok: true, remote: { ip: remote.ip, port: remote.port } });
    }
    if (req.url === '/deregister') { remote = null; log('INFO', 'deregister'); return sendJson(res, 200, { ok: true }); }
    if (req.url === '/speak') {
      sendJson(res, 202, { ok: true });
      route(body.text, cfg, { sessionId: body.sessionId, sessionTitle: body.sessionTitle, workspace: body.workspace, tab: body.tab, pane: body.pane });
      return;
    }
    return sendJson(res, 404, { error: 'not found' });
  };
}

// Daemon entry: start the router HTTP server with a local speaker and a
// forwarder that POSTs to the registered remote sink.
function main() {
  const logFile = join(homedir(), '.herdr-voice', 'logs', 'herdr-voice.log');
  const log = makeLogger({ file: logFile });
  const bind = process.env.HERD_VOICE_BIND || '0.0.0.0';
  const cfg0 = loadConfig();
  const forward = (ip, port, text, meta = {}) => {
    const c = loadConfig();
    return postJson(`http://${ip}:${port}/speak`, { text, ...meta }, { token: c.token, timeoutMs: c.forwardTimeoutMs })
      .then((r) => { if (r.status >= 300) throw new Error(`sink ${r.status}`); });
  };
  const handler = makeRouter({ getConfig: loadConfig, speak: makeSpeaker({ getConfig: loadConfig, log }), forward, now: Date.now, log });
  http.createServer(handler).listen(cfg0.port, bind, () => log('INFO', 'start', { service: 'voice-router', bind, port: cfg0.port }));
  process.on('SIGTERM', () => { log('INFO', 'stop', { service: 'voice-router' }); process.exit(0); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

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

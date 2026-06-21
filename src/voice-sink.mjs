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

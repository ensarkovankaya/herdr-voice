import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { readJsonBody, sendJson } from './lib/http.mjs';
import { makeSpeaker } from './lib/tts/index.mjs';
import { makeLogger, metaTag } from './lib/logger.mjs';
import { startPresenceWatcher } from './lib/presence.mjs';

// Build the remote sink's HTTP request handler: authenticates the token, then
// speaks incoming /speak text locally (unless voice is globally disabled).
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
      log('INFO', `SPEAK${metaTag({ sessionId: body.sessionId, pane: body.pane })} "${(body.text || '').slice(0, 200)}"`);
      speak(body.text);
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  };
}

// Daemon entry: start the sink HTTP server and the presence watcher that
// registers this device with the host while a remote session is active.
function main() {
  const logFile = join(homedir(), '.herdr-voice', 'logs', 'herdr-voice.log');
  const log = makeLogger({ file: logFile });
  const bind = process.env.HERD_VOICE_BIND || '0.0.0.0';
  const cfg0 = loadConfig();
  const handler = makeSinkHandler({ getConfig: loadConfig, speak: makeSpeaker({ getConfig: loadConfig, log }), log });
  http.createServer(handler).listen(cfg0.port, bind, () => log('INFO', `START voice-sink ${bind}:${cfg0.port}`));
  startPresenceWatcher({ getConfig: loadConfig, log });
  process.on('SIGTERM', () => { log('INFO', 'STOP voice-sink'); process.exit(0); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

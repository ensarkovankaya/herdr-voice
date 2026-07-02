import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { readJsonBody, sendJson } from './lib/http.mjs';
import { makeSpeaker } from './lib/tts/index.mjs';
import { makeLogger } from './lib/logger.mjs';
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
      if (!cfg.enabled) { log('INFO', 'speak_skipped', { reason: 'disabled' }); return sendJson(res, 200, { skipped: true }); }
      sendJson(res, 202, { ok: true });
      const provider = cfg.tts?.providers?.[0] || 'say';
      log('INFO', 'speak', { text: (body.text || '').slice(0, 200), provider, voice: cfg.tts?.[provider]?.voice, sessionId: body.sessionId, sessionTitle: body.sessionTitle, workspace: body.workspace, tab: body.tab, pane: body.pane });
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
  http.createServer(handler).listen(cfg0.port, bind, () => log('INFO', 'start', { service: 'voice-sink', bind, port: cfg0.port }));
  startPresenceWatcher({ getConfig: loadConfig, log });
  process.on('SIGTERM', () => { log('INFO', 'stop', { service: 'voice-sink' }); process.exit(0); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

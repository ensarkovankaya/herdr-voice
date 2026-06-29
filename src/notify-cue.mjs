import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { postJson } from './lib/http.mjs';
import { voiceEnabledForPane } from './lib/pane.mjs';

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
  if (!voiceEnabledForPane(cfg)) return;
  let input = {};
  try { input = JSON.parse(await readStdin()); } catch { /* still send the fixed cue */ }
  const sessionId = (input && input.session_id) || '';
  try {
    await postJson(`http://${cfg.host}:${cfg.port}/speak`, { text: cueFor(input, cfg), sessionId, pane: process.env.HERDR_PANE_ID || '' }, { token: cfg.token, timeoutMs: cfg.postTimeoutMs });
  } catch { /* swallow */ }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(() => {});

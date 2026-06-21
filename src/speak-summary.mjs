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

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(() => {});

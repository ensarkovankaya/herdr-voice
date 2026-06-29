import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { makeSummarizer } from './lib/summarize/index.mjs';
import { makeLlmSummarizer } from './lib/summarize/llm.mjs';
import { makeCommandSummarizer } from './lib/summarize/command.mjs';
import { makeClaudeSummarizer } from './lib/summarize/claude.mjs';
import { RECURSION_GUARD_ENV } from './lib/summarize/spawn.mjs';
import { postJson } from './lib/http.mjs';
import { voiceEnabledForPane } from './lib/pane.mjs';

// Walk the JSONL transcript backwards and return the most recent assistant
// message's text (joining its text blocks); '' if none is found.
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

// The Stop hook can fire before Claude has finished flushing the final
// assistant message to the transcript, so a naive read returns the PREVIOUS
// turn's text (off-by-one). Wait until the file size stops changing (the write
// has settled) before reading. Deps are injectable for testing.
export async function readSettledFile(path, {
  read = (p) => readFileSync(p, 'utf8'),
  size = (p) => { try { return statSync(p).size; } catch { return -1; } },
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  gapMs = 150, minChecks = 3, stableNeeded = 2, maxChecks = 14,
} = {}) {
  let prev = -1; let stable = 0;
  for (let i = 0; i < maxChecks; i++) {
    const s = size(path);
    if (s === prev) stable++; else stable = 0;
    prev = s;
    if (i + 1 >= minChecks && stable >= stableNeeded) break;
    await sleep(gapMs);
  }
  try { return read(path); } catch { return null; }
}

// Read all of stdin to a string (the hook payload); resolves '' on error.
function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', () => resolve(buf));
  });
}

// Stop-hook entry: read the settled transcript, summarize the last assistant
// turn, and POST it to the local router. No-op when voice is off for this pane.
async function main() {
  // Bail if we are the Stop hook of a `claude -p` summary spawned by this very
  // hook (the `command`/`claude` modes). spawnCapture stamps that flag; without
  // this guard, mode=claude would recurse: summary → claude -p → Stop hook →
  // summary → …
  if (process.env[RECURSION_GUARD_ENV]) return;
  const cfg = loadConfig();
  if (!voiceEnabledForPane(cfg)) return;
  let input;
  try { input = JSON.parse(await readStdin()); } catch { return; }
  if (!input.transcript_path) return;
  const jsonl = await readSettledFile(input.transcript_path);
  if (jsonl == null) return;
  const summarize = makeSummarizer({
    getLlm: () => makeLlmSummarizer(),
    getCommand: () => makeCommandSummarizer(),
    getClaude: () => makeClaudeSummarizer(),
  });
  const text = await summarize(extractLastAssistantText(jsonl), cfg);
  const sessionId = input.session_id || (input.transcript_path || '').split('/').pop().replace(/\.jsonl$/, '');
  try {
    await postJson(`http://${cfg.host}:${cfg.port}/speak`, { text, sessionId, pane: process.env.HERDR_PANE_ID || '' }, { token: cfg.token, timeoutMs: cfg.postTimeoutMs });
  } catch { /* swallow */ }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(() => {});

import { fileURLToPath } from 'node:url';
import { openSync, readSync, closeSync } from 'node:fs';
import { loadConfig } from './lib/config.mjs';
import { postJson } from './lib/http.mjs';
import { voiceEnabledForPane, paneIsFocused, herdrNames } from './lib/pane.mjs';
import { readSession } from './lib/session-store.mjs';
import { formatPrefix } from './lib/summarize/recap.mjs';
import { isSubagentTranscript } from './lib/transcript.mjs';

// First `bytes` of a file as UTF-8 ('' on any error). Transcripts can be tens
// of MB; the entrypoint marker sits in the first few lines, so a bounded head
// read is enough for the subagent check without loading the whole file.
function readHead(path, bytes = 65536) {
  try {
    const fd = openSync(path, 'r');
    try {
      const buf = Buffer.alloc(bytes);
      const n = readSync(fd, buf, 0, bytes, 0);
      return buf.toString('utf8', 0, n);
    } finally { closeSync(fd); }
  } catch { return ''; }
}

// Pick the spoken cue by Notification kind: `idle_prompt` (Claude is idle,
// waiting for the user) gets `cueIdle`; permission prompts and every other type
// get the default `cue`. Falls back to `cue` when `cueIdle` is unset.
export function cueFor(input, cfg) {
  const kind = (input && (input.notification_type || input.type)) || '';
  if (kind === 'idle_prompt' && cfg.cueIdle) return cfg.cueIdle;
  return cfg.cue;
}

// Cue subtype for the menu bar app: `idle_prompt` → 'idle', all others → 'permission'.
export function cueKindOf(input) {
  const kind = (input && (input.notification_type || input.type)) || '';
  return kind === 'idle_prompt' ? 'idle' : 'permission';
}

// The spoken cue text: the fixed cue, prefixed with this session's cached
// prefix when one exists. Reads only the cached session file — no LLM, no
// transcript parse. readSession is injectable for testing.
export function cueText(input, cfg, { readSession: rs = readSession } = {}) {
  const cue = cueFor(input, cfg);
  const sessionId = (input && input.session_id) || '';
  const prefix = sessionId ? (rs(sessionId).prefix || '') : '';
  return prefix ? formatPrefix(prefix, cue, cfg) : cue;
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

// Notification-hook entry: when voice is on for this pane, POST the fixed cue
// phrase to the local router (which speaks it locally or forwards it).
async function main() {
  const cfg = loadConfig();
  if (!voiceEnabledForPane(cfg)) return;
  // The foreground session — you can see its prompt yourself, no need to cue it.
  if (cfg.muteFocusedPane && paneIsFocused()) return;
  let input = {};
  try { input = JSON.parse(await readStdin()); } catch { /* still send the fixed cue */ }
  // SDK-spawned agent sessions (subagents) fire this hook too — never cue them.
  if (input && input.transcript_path && isSubagentTranscript(readHead(input.transcript_path))) return;
  const sessionId = (input && input.session_id) || '';
  try {
    await postJson(`http://${cfg.host}:${cfg.port}/speak`, {
      text: cueText(input, cfg), sessionId,
      sessionTitle: (readSession(sessionId).prefix) || '',
      kind: 'cue', cueKind: cueKindOf(input),
      workspace: process.env.HERDR_WORKSPACE_ID || '',
      tab: process.env.HERDR_TAB_ID || '',
      pane: process.env.HERDR_PANE_ID || '',
      ...herdrNames(), // workspaceName, tabName, paneCwd ('' outside herdr)
    }, { token: cfg.token, timeoutMs: cfg.postTimeoutMs });
  } catch { /* swallow */ }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(() => {});

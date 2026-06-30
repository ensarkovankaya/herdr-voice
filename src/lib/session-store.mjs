import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// One JSON file per Claude session under ~/.herdr-voice/sessions. Holds the
// spoken `prefix` (read by both hooks) plus rolling-recap bookkeeping
// (recap, turnsSinceRecap, transcriptChars). `dir` is injectable for tests,
// mirroring src/lib/pane.mjs.
function sessionsDir() {
  return join(homedir(), '.herdr-voice', 'sessions');
}

// Filename-safe id: every non-alphanumeric -> '_' (mirrors paneKey), so an
// arbitrary session id can never escape the directory.
export function sessionKey(sessionId) {
  return (sessionId || '').replace(/[^A-Za-z0-9]/g, '_');
}

export function sessionPath(sessionId, dir = sessionsDir()) {
  return join(dir, `${sessionKey(sessionId)}.json`);
}

export function readSession(sessionId, { read = (p) => readFileSync(p, 'utf8'), dir } = {}) {
  if (!sessionId) return {};
  try { return JSON.parse(read(sessionPath(sessionId, dir || sessionsDir()))) || {}; }
  catch { return {}; }
}

export function writeSession(sessionId, data, {
  write = (p, s) => writeFileSync(p, s),
  mkdir = (d) => mkdirSync(d, { recursive: true }),
  dir,
} = {}) {
  if (!sessionId) return;
  const d = dir || sessionsDir();
  try { mkdir(d); write(sessionPath(sessionId, d), JSON.stringify(data)); }
  catch { /* swallow */ }
}

// Best-effort: delete session files whose mtime is older than `days`.
export function pruneOld(now, days = 30, {
  readdir = (d) => readdirSync(d),
  stat = (p) => statSync(p),
  rm = (p) => rmSync(p),
  dir,
} = {}) {
  const d = dir || sessionsDir();
  const maxAge = days * 24 * 60 * 60 * 1000;
  try {
    for (const f of readdir(d)) {
      if (!f.endsWith('.json')) continue;
      const p = join(d, f);
      try { if (now - stat(p).mtimeMs > maxAge) rm(p); } catch { /* skip one */ }
    }
  } catch { /* swallow */ }
}

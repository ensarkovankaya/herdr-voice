import { appendFileSync, statSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Build a " [sess:abcd1234 pane:w…:p4]" tag for log lines from optional
// identifiers. Empty fields are skipped; returns '' when nothing is known.
export function metaTag(meta = {}) {
  const parts = [];
  if (meta && meta.sessionId) parts.push(`sess:${String(meta.sessionId).slice(0, 8)}`);
  if (meta && meta.pane) parts.push(`pane:${meta.pane}`);
  return parts.length ? ` [${parts.join(' ')}]` : '';
}

export function makeLogger({ file, maxBytes = 1_000_000, keep = 5 }) {
  function rotate() {
    try {
      if (!existsSync(file) || statSync(file).size <= maxBytes) return;
      for (let i = keep - 1; i >= 1; i--) {
        if (existsSync(`${file}.${i}`)) renameSync(`${file}.${i}`, `${file}.${i + 1}`);
      }
      renameSync(file, `${file}.1`);
    } catch { /* swallow */ }
  }
  return function log(level, msg) {
    try {
      mkdirSync(dirname(file), { recursive: true });
      rotate();
      appendFileSync(file, `[${new Date().toISOString()}] [${level}] ${msg}\n`);
    } catch { /* swallow */ }
  };
}

import { appendFileSync, statSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Append-only JSON-lines logger with size-based rotation (file.1 .. file.keep).
// Each call writes one JSON object per line: {ts, level, event, ...fields}.
// Returns log(level, event, fields?); null/undefined fields are dropped. All
// I/O errors are swallowed so logging can never crash the daemon.
export function makeLogger({ file, maxBytes = 1_000_000, keep = 5 }) {
  // Shift file.N -> file.N+1 and the live file -> file.1 once it exceeds maxBytes.
  function rotate() {
    try {
      if (!existsSync(file) || statSync(file).size <= maxBytes) return;
      for (let i = keep - 1; i >= 1; i--) {
        if (existsSync(`${file}.${i}`)) renameSync(`${file}.${i}`, `${file}.${i + 1}`);
      }
      renameSync(file, `${file}.1`);
    } catch { /* swallow */ }
  }
  return function log(level, event, fields = {}) {
    try {
      const rec = { ts: new Date().toISOString(), level, event };
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined && v !== null) rec[k] = v;
      }
      mkdirSync(dirname(file), { recursive: true });
      rotate();
      appendFileSync(file, `${JSON.stringify(rec)}\n`);
    } catch { /* swallow */ }
  };
}

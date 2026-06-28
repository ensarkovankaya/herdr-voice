import { appendFileSync, statSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function makeLogger({ file, maxBytes = 1_000_000, keep = 5 }) {
  function rotate() {
    try {
      if (!existsSync(file) || statSync(file).size <= maxBytes) return;
      for (let i = keep - 1; i >= 1; i--) {
        if (existsSync(`${file}.${i}`)) renameSync(`${file}.${i}`, `${file}.${i + 1}`);
      }
      renameSync(file, `${file}.1`);
    } catch { /* yut */ }
  }
  return function log(level, msg) {
    try {
      mkdirSync(dirname(file), { recursive: true });
      rotate();
      appendFileSync(file, `[${new Date().toISOString()}] [${level}] ${msg}\n`);
    } catch { /* yut */ }
  };
}

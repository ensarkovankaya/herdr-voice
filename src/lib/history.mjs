import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Parse the last `max` non-empty lines of a JSONL history file. Missing file or
// corrupt lines yield fewer/zero entries rather than throwing.
export function loadHistory(file, { max = 50, read = (p) => readFileSync(p, 'utf8') } = {}) {
  let lines;
  try { lines = read(file).split('\n').filter(Boolean); } catch { return []; }
  const out = [];
  for (const l of lines.slice(-max)) {
    try { out.push(JSON.parse(l)); } catch { /* skip corrupt */ }
  }
  return out;
}

// Append one entry as a JSON line, creating the parent dir. Errors swallowed.
export function appendHistory(file, entry, {
  append = (p, s) => appendFileSync(p, s),
  mkdir = (d) => mkdirSync(d, { recursive: true }),
} = {}) {
  try { mkdir(dirname(file)); append(file, `${JSON.stringify(entry)}\n`); }
  catch { /* swallow */ }
}

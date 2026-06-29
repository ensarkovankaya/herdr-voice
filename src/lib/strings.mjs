import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Spoken-string packs live as one JSON file per language in ./locales
// (keys: cue, fallback, voiceOn, voiceOff). Add a language by dropping a file
// there — no code change. The same files are read by the Bash CLI/plugin via
// jq, so translations have a single source of truth across both runtimes.
const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'locales');

const cache = new Map();
function loadPack(language) {
  if (cache.has(language)) return cache.get(language);
  let pack = null;
  try { pack = JSON.parse(readFileSync(join(LOCALES_DIR, `${language}.json`), 'utf8')); }
  catch { pack = null; }
  cache.set(language, pack);
  return pack;
}

// English is the base: unknown languages and missing keys fall back to it,
// so partial translations are fine.
const EN = loadPack('en') || {};

// String pack for a language code, with English as the per-key fallback.
export function stringsFor(language) {
  const pack = loadPack(language);
  return pack ? { ...EN, ...pack } : { ...EN };
}

// Language codes with a locale file present on disk (e.g. ['en', 'tr']).
export function availableLanguages() {
  try {
    return readdirSync(LOCALES_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5))
      .sort();
  } catch { return ['en']; }
}

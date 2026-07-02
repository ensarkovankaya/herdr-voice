import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stringsFor } from './strings.mjs';

const DEFAULTS = {
  token: '', host: '127.0.0.1', port: 8973, language: 'en',
  enabled: false, sessionDefault: 'on', muteFocusedPane: false, audioMuted: false, role: 'host', remoteHost: '',
  remoteTtlMs: 3_600_000, forwardTimeoutMs: 1500, postTimeoutMs: 1500,
};

const TTS_DEFAULTS = {
  say: { voice: 'Samantha' },
  piper: { cmd: 'python3 -m piper', voice: 'en_US-lessac-medium', dataDir: join(homedir(), '.herdr-voice', 'voices') },
  gemini: { model: 'gemini-2.5-flash-preview-tts', voice: 'Kore', apiKeyEnv: 'GEMINI_API_KEY', languageCode: '' },
};
const AUDIO_DEFAULTS = { player: 'auto' };
const SUMMARIZE_DEFAULTS = {
  mode: 'heuristic', maxLen: 240, llm: {}, command: {}, claude: {},
  recap: { enabled: true, everyTurns: 5, maxLen: 60, pruneAfterDays: 30, prompt: '' },
};

// On-disk config path; HERD_VOICE_CONFIG overrides it (used by tests).
export function configPath() {
  return process.env.HERD_VOICE_CONFIG || join(homedir(), '.herdr-voice', 'config.json');
}

// Layer the user's tts settings over the defaults so every provider's block is
// fully populated regardless of which provider is selected.
function mergeTts(tts = {}) {
  const providers = (Array.isArray(tts.providers) && tts.providers.length) ? tts.providers : ['say'];
  return {
    // Fallback priority list; tried in order until one produces audio.
    providers,
    say: { ...TTS_DEFAULTS.say, ...(tts.say || {}) },
    piper: { ...TTS_DEFAULTS.piper, ...(tts.piper || {}) },
    gemini: { ...TTS_DEFAULTS.gemini, ...(tts.gemini || {}) },
  };
}

// One-time migration: fold a legacy singular `tts.provider` into the ordered
// `tts.providers` list and drop the key. Mutates `raw` in place; returns true
// only when something changed (so the caller rewrites the file just once).
function migrateTtsProvider(raw) {
  if (!raw || !raw.tts || !Object.prototype.hasOwnProperty.call(raw.tts, 'provider')) return false;
  if (!Array.isArray(raw.tts.providers) || raw.tts.providers.length === 0) {
    raw.tts.providers = [raw.tts.provider];
  }
  delete raw.tts.provider;
  return true;
}

// Read config.json (missing/invalid -> defaults), then layer user values over
// DEFAULTS and resolve the language-dependent strings.
export function loadConfig() {
  let raw = {};
  try { raw = JSON.parse(readFileSync(configPath(), 'utf8')); } catch { /* defaults */ }
  if (migrateTtsProvider(raw)) {
    try { writeFileSync(configPath(), `${JSON.stringify(raw, null, 2)}\n`); } catch { /* best-effort; never break load */ }
  }
  const merged = { ...DEFAULTS, ...raw };
  merged.tts = mergeTts(raw.tts);
  merged.audio = { ...AUDIO_DEFAULTS, ...(raw.audio || {}) };
  merged.summarize = { ...SUMMARIZE_DEFAULTS, ...(raw.summarize || {}) };
  merged.summarize.recap = { ...SUMMARIZE_DEFAULTS.recap, ...((raw.summarize || {}).recap || {}) };
  const pack = stringsFor(merged.language);
  merged.cue = raw.cue ?? pack.cue;
  merged.cueIdle = raw.cueIdle ?? pack.cueIdle;
  merged.fallback = raw.fallback ?? pack.fallback;
  merged.voiceOnText = raw.voiceOnText ?? pack.voiceOn;
  merged.voiceOffText = raw.voiceOffText ?? pack.voiceOff;
  merged.recapTemplate = raw.recapTemplate ?? pack.recapTemplate;
  return merged;
}

// Flip `enabled` on disk, preserving every other config key. Read-modify-write
// with 2-space indent + trailing newline (matches the installer's format).
export function setEnabled(enabled, {
  path = configPath(),
  read = (p) => readFileSync(p, 'utf8'),
  write = (p, s) => writeFileSync(p, s),
} = {}) {
  let raw = {};
  try { raw = JSON.parse(read(path)) || {}; } catch { /* start empty */ }
  raw.enabled = !!enabled;
  write(path, `${JSON.stringify(raw, null, 2)}\n`);
  return raw.enabled;
}

// Flip `audioMuted` on disk, preserving every other config key. Read-modify-write
// with 2-space indent + trailing newline (matches setEnabled / the installer format).
export function setAudioMuted(muted, {
  path = configPath(),
  read = (p) => readFileSync(p, 'utf8'),
  write = (p, s) => writeFileSync(p, s),
} = {}) {
  let raw = {};
  try { raw = JSON.parse(read(path)) || {}; } catch { /* start empty */ }
  raw.audioMuted = !!muted;
  write(path, `${JSON.stringify(raw, null, 2)}\n`);
  return raw.audioMuted;
}

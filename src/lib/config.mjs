import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stringsFor } from './strings.mjs';

const DEFAULTS = {
  token: '', host: '127.0.0.1', port: 8973, language: 'en',
  enabled: false, sessionDefault: 'on', role: 'host', remoteHost: '',
  remoteTtlMs: 3_600_000, forwardTimeoutMs: 1500, postTimeoutMs: 1500,
};

const TTS_DEFAULTS = {
  provider: 'say',
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
  return {
    provider: tts.provider || TTS_DEFAULTS.provider,
    say: { ...TTS_DEFAULTS.say, ...(tts.say || {}) },
    piper: { ...TTS_DEFAULTS.piper, ...(tts.piper || {}) },
    gemini: { ...TTS_DEFAULTS.gemini, ...(tts.gemini || {}) },
  };
}

// Read config.json (missing/invalid -> defaults), then layer user values over
// DEFAULTS and resolve the language-dependent strings.
export function loadConfig() {
  let raw = {};
  try { raw = JSON.parse(readFileSync(configPath(), 'utf8')); } catch { /* defaults */ }
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

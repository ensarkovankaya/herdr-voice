import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stringsFor } from './strings.mjs';

const DEFAULTS = {
  token: '',
  host: '127.0.0.1',
  port: 8973,
  language: 'en',
  voice: 'Samantha',
  enabled: false,
  role: 'host',
  remoteHost: '',
  remoteTtlMs: 3_600_000,
  forwardTimeoutMs: 1500,
  postTimeoutMs: 1500,
};

export function configPath() {
  return process.env.HERD_VOICE_CONFIG
    || join(homedir(), '.herdr-voice', 'config.json');
}

export function loadConfig() {
  let raw = {};
  try { raw = JSON.parse(readFileSync(configPath(), 'utf8')); } catch { /* fall back to defaults */ }
  const merged = { ...DEFAULTS, ...raw };
  // Spoken strings default to the language pack; explicit config fields win.
  const pack = stringsFor(merged.language);
  merged.cue = raw.cue ?? pack.cue;
  merged.fallback = raw.fallback ?? pack.fallback;
  merged.voiceOnText = raw.voiceOnText ?? pack.voiceOn;
  merged.voiceOffText = raw.voiceOffText ?? pack.voiceOff;
  return merged;
}

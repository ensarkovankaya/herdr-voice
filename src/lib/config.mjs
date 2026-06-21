import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULTS = {
  token: '',
  host: '127.0.0.1',
  port: 8973,
  voice: 'Yelda',
  enabled: false,
  remoteTtlMs: 3_600_000,
  forwardTimeoutMs: 1500,
  postTimeoutMs: 1500,
  cue: 'Onayın gerekiyor.',
};

export function configPath() {
  return process.env.HERD_VOICE_CONFIG
    || join(homedir(), '.config', 'herd-voice', 'config.json');
}

export function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(configPath(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

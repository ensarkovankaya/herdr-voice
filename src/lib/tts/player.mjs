import { spawn as realSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Candidate players per platform, in preference order. Each entry maps a file
// path to the full arg list. All write to the default output device.
const PLAYERS = {
  darwin: [['afplay', (f) => [f]]],
  linux: [
    ['paplay', (f) => [f]],
    ['aplay', (f) => ['-q', f]],
    ['ffplay', (f) => ['-nodisp', '-autoexit', '-loglevel', 'quiet', f]],
    ['play', (f) => ['-q', f]],
  ],
};

function defaultWhich(bin) {
  return (process.env.PATH || '').split(':').some((d) => d && existsSync(join(d, bin)));
}

export function resolvePlayer({ platform = process.platform, which = defaultWhich, audio = {} } = {}, file) {
  const cfg = audio.player;
  if (cfg && cfg !== 'auto') {
    if (cfg.includes('${file}')) {
      const parts = cfg.replace(/\$\{file\}/g, file).split(/\s+/).filter(Boolean);
      return [parts[0], parts.slice(1)];
    }
    return [cfg, [file]]; // bare binary name
  }
  for (const [bin, mk] of (PLAYERS[platform] || [])) if (which(bin)) return [bin, mk(file)];
  return [null, []];
}

export function makePlayer({ platform = process.platform, spawn = realSpawn, which = defaultWhich, audio = {} } = {}) {
  return function play(file) {
    return new Promise((resolve) => {
      const [bin, args] = resolvePlayer({ platform, which, audio }, file);
      if (!bin) return resolve();
      let child;
      try { child = spawn(bin, args, { stdio: 'ignore' }); }
      catch { return resolve(); }
      child.on('error', () => resolve());
      child.on('close', () => resolve());
    });
  };
}

import { spawn as realSpawn } from 'node:child_process';

// macOS `say` provider: speaks straight through the system synthesizer (no
// separate audio player needed). Resolves when speech finishes; never rejects.
export function makeSayProvider({ spawn = realSpawn } = {}) {
  return {
    name: 'say',
    speak(text, { cfg }) {
      return new Promise((resolve) => {
        let child;
        try { child = spawn('say', ['-v', cfg.tts.say.voice, text], { stdio: 'ignore' }); }
        catch { return resolve({ ok: false, reason: 'spawn_failed' }); }
        child.on('error', () => resolve({ ok: false, reason: 'spawn_failed' }));
        child.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, reason: 'exit_' + code }));
      });
    },
  };
}

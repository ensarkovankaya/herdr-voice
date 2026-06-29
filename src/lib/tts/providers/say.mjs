import { spawn as realSpawn } from 'node:child_process';

export function makeSayProvider({ spawn = realSpawn } = {}) {
  return {
    name: 'say',
    speak(text, { cfg }) {
      return new Promise((resolve) => {
        let child;
        try { child = spawn('say', ['-v', cfg.tts.say.voice, text], { stdio: 'ignore' }); }
        catch { return resolve(); }
        child.on('error', () => resolve());
        child.on('close', () => resolve());
      });
    },
  };
}

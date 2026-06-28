import { spawn as realSpawn } from 'node:child_process';

export function makeSpeak(spawnImpl = realSpawn) {
  let chain = Promise.resolve();
  return function speak(text, { voice = 'Samantha' } = {}) {
    const t = (text || '').trim();
    if (!t) return chain;
    chain = chain.then(() => new Promise((resolve) => {
      let child;
      try { child = spawnImpl('say', ['-v', voice, t], { stdio: 'ignore' }); }
      catch { return resolve(); }
      child.on('error', () => resolve());
      child.on('close', () => resolve());
    }));
    return chain;
  };
}

export const speak = makeSpeak();

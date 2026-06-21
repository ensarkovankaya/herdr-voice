import { spawn as realSpawn } from 'node:child_process';

export function makeSpeak(spawnImpl = realSpawn) {
  let chain = Promise.resolve();
  let isPending = false;

  return function speak(text, { voice = 'Yelda' } = {}) {
    const t = (text || '').trim();
    if (!t) return chain;

    const shouldCallSync = !isPending;

    if (shouldCallSync) {
      isPending = true;
      let child;
      try { child = spawnImpl('say', ['-v', voice, t], { stdio: 'ignore' }); }
      catch { child = null; }

      chain = new Promise((resolve) => {
        if (!child) { isPending = false; return resolve(); }
        const handler = () => { isPending = false; resolve(); };
        child.on('error', handler);
        child.on('close', handler);
      });
    } else {
      chain = chain.then(() => new Promise((resolve) => {
        let child;
        try { child = spawnImpl('say', ['-v', voice, t], { stdio: 'ignore' }); }
        catch { return resolve(); }
        const handler = () => { isPending = false; resolve(); };
        child.on('error', handler);
        child.on('close', handler);
      }));
    }

    return chain;
  };
}

export const speak = makeSpeak();

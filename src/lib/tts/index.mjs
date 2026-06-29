import { makePlayer } from './player.mjs';

// Built-in lazy registry: only the selected provider's module is imported.
const FACTORIES = {
  say: () => import('./providers/say.mjs').then((m) => m.makeSayProvider()),
  piper: () => import('./providers/piper.mjs').then((m) => m.makePiperProvider()),
  gemini: () => import('./providers/gemini.mjs').then((m) => m.makeGeminiProvider()),
};

// Build speak(text): serializes utterances through a promise chain (one at a
// time), lazily instantiates and caches the configured provider, and swallows
// provider errors so a TTS failure never breaks the caller.
export function makeSpeaker({ getConfig, log, makeProvider, player } = {}) {
  const say = log || (() => {});
  let chain = Promise.resolve();
  const cache = {};
  return function speak(text) {
    const t = (text || '').trim();
    if (!t) return chain;
    chain = chain.then(async () => {
      const cfg = getConfig();
      const name = cfg.tts.provider || 'say';
      const play = player || makePlayer({ audio: cfg.audio });
      if (!cache[name]) cache[name] = await (makeProvider ? makeProvider(name) : (FACTORIES[name] || FACTORIES.say)());
      try { await cache[name].speak(t, { cfg, log: say, player: play }); }
      catch (e) { say('WARN', 'tts_error', { provider: name, error: e.message }); }
    });
    return chain;
  };
}

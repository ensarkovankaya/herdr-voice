import { makePlayer } from './player.mjs';

// Built-in lazy registry: only the selected provider's module is imported.
const FACTORIES = {
  say: () => import('./providers/say.mjs').then((m) => m.makeSayProvider()),
  piper: () => import('./providers/piper.mjs').then((m) => m.makePiperProvider()),
  gemini: () => import('./providers/gemini.mjs').then((m) => m.makeGeminiProvider()),
};

// Build speak(text): serializes utterances through a promise chain (one at a
// time) and walks the configured provider list (cfg.tts.providers) in order,
// falling back to the next provider whenever one fails to produce audio. Each
// provider returns { ok, reason }; a TTS failure never breaks the caller.
export function makeSpeaker({ getConfig, log, makeProvider, player } = {}) {
  const say = log || (() => {});
  let chain = Promise.resolve();
  const cache = {};
  async function attempt(name, t, cfg, play) {
    if (!cache[name]) cache[name] = await (makeProvider ? makeProvider(name) : (FACTORIES[name] || FACTORIES.say)());
    try { return await cache[name].speak(t, { cfg, log: say, player: play }); }
    catch (e) { return { ok: false, reason: 'threw:' + e.message }; }
  }
  return function speak(text) {
    const t = (text || '').trim();
    if (!t) return chain;
    chain = chain.then(async () => {
      const cfg = getConfig();
      const list = (cfg.tts.providers && cfg.tts.providers.length) ? cfg.tts.providers : [cfg.tts.provider || 'say'];
      const play = player || makePlayer({ audio: cfg.audio });
      for (let i = 0; i < list.length; i++) {
        const name = list[i];
        const res = await attempt(name, t, cfg, play);
        if (res && res.ok) { if (i > 0) say('INFO', 'tts_spoke', { provider: name }); return; }
        say('WARN', 'tts_fallback', { provider: name, reason: res && res.reason, next: list[i + 1] || null });
      }
      say('WARN', 'tts_all_failed', { providers: list });
    });
    return chain;
  };
}

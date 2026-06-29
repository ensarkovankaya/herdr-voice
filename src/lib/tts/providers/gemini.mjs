import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pcmToWav } from '../wav.mjs';

export function makeGeminiProvider({
  fetchImpl = globalThis.fetch,
  writeFile = writeFileSync,
  mkdtemp = () => mkdtempSync(join(tmpdir(), 'hv-')),
  rm = rmSync,
} = {}) {
  return {
    name: 'gemini',
    async speak(text, { cfg, player, log }) {
      const say = log || (() => {});
      const { model, voice, apiKeyEnv, languageCode } = cfg.tts.gemini;
      const key = process.env[apiKeyEnv];
      if (!key) { say('WARN', `gemini: env ${apiKeyEnv} not set`); return; }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } };
      if (languageCode) speechConfig.languageCode = languageCode;
      const body = { contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig } };
      let data;
      try {
        const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
        if (!res.ok) { say('WARN', `gemini: HTTP ${res.status}`); return; }
        const json = await res.json();
        data = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      } catch (e) { say('WARN', `gemini: ${e.message}`); return; }
      if (!data) { say('WARN', 'gemini: no audio in response'); return; }
      const wavBuf = pcmToWav(Buffer.from(data, 'base64'), { sampleRate: 24000, channels: 1, bitDepth: 16 });
      const dir = mkdtemp();
      const wav = join(dir, 'out.wav');
      writeFile(wav, wavBuf);
      await player(wav);
      try { rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

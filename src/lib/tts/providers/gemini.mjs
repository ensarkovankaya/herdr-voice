import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pcmToWav } from '../wav.mjs';

// Gemini TTS provider: POST the text to the generateContent endpoint, decode the
// returned base64 PCM, wrap it as WAV, and play it via the injected player.
// Missing key / HTTP / decode errors are logged and swallowed (never throws).
export function makeGeminiProvider({
  fetchImpl = globalThis.fetch,
  writeFile = writeFileSync,
  mkdtemp = () => mkdtempSync(join(tmpdir(), 'hv-')),
  rm = rmSync,
} = {}) {
  return {
    name: 'gemini',
    async speak(text, { cfg, player }) {
      const { model, voice, apiKey, apiKeyEnv, languageCode } = cfg.tts.gemini;
      // Prefer an inline key from config; otherwise read the named env var.
      const key = apiKey || (apiKeyEnv ? process.env[apiKeyEnv] : undefined);
      if (!key) return { ok: false, reason: 'no_key' };
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } };
      if (languageCode) speechConfig.languageCode = languageCode;
      const body = { contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig } };
      let data;
      try {
        const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
        if (!res.ok) return { ok: false, reason: 'http_' + res.status };
        const json = await res.json();
        data = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      } catch (e) { return { ok: false, reason: 'error:' + e.message }; }
      if (!data) return { ok: false, reason: 'no_audio' };
      const wavBuf = pcmToWav(Buffer.from(data, 'base64'), { sampleRate: 24000, channels: 1, bitDepth: 16 });
      const dir = mkdtemp();
      const wav = join(dir, 'out.wav');
      writeFile(wav, wavBuf);
      // Synthesis succeeded; a playback error must not flip this to a failure.
      try { await player(wav); } catch { /* playback issue */ }
      try { rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
      return { ok: true };
    },
  };
}

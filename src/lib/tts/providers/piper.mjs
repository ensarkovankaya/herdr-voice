import { spawn as realSpawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `cmd` may be a multi-word launcher ("python3 -m piper"); split into bin + base args.
export function makePiperProvider({
  spawn = realSpawn,
  mkdtemp = () => mkdtempSync(join(tmpdir(), 'hv-')),
  rm = rmSync,
} = {}) {
  return {
    name: 'piper',
    async speak(text, { cfg, player }) {
      const { cmd, voice, dataDir } = cfg.tts.piper;
      const [bin, ...base] = cmd.split(/\s+/).filter(Boolean);
      const dir = mkdtemp();
      const wav = join(dir, 'out.wav');
      const args = [...base, '-m', voice, '--data-dir', dataDir, '-f', wav, '--', text];
      const synth = await new Promise((resolve) => {
        let child;
        try { child = spawn(bin, args, { stdio: 'ignore' }); }
        catch { return resolve({ ok: false, reason: 'spawn_failed' }); }
        child.on('error', () => resolve({ ok: false, reason: 'spawn_failed' }));
        child.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, reason: 'exit_' + code }));
      });
      // synth failure ⇒ no audio produced; let the speaker fall back. A playback
      // error (afplay) does not: synthesis succeeded and another provider shares
      // the same player, so it would not help.
      if (synth.ok) { try { await player(wav); } catch { /* playback issue */ } }
      try { rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
      return synth;
    },
  };
}

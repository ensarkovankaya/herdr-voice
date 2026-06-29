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
      await new Promise((resolve) => {
        let child;
        try { child = spawn(bin, args, { stdio: 'ignore' }); }
        catch { return resolve(); }
        child.on('error', () => resolve());
        child.on('close', () => resolve());
      });
      await player(wav);
      try { rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

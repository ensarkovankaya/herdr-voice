import { spawn as realSpawn } from 'node:child_process';

// Env var stamped on every summarizer child. A `command`/`claude` summary may
// itself run `claude -p`; that nested Claude session's own Stop hook would
// re-enter speak-summary and spawn yet another summary — an infinite loop. The
// hook checks this flag at entry and bails, breaking the recursion. It rides
// down the spawned process tree via normal env inheritance.
export const RECURSION_GUARD_ENV = 'HERDR_VOICE_SUMMARIZING';

// Spawn `cmd args`, optionally writing `input` to the child's stdin, and
// resolve its trimmed stdout. Rejects on spawn error, empty output, or timeout
// (the child is killed first). Shared by the `command` and `claude` summarizers
// so the callers fall back to the heuristic on any failure.
export function spawnCapture(cmd, args, { spawn = realSpawn, input = null, timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    let out = ''; let done = false; let child;
    const finish = (fn, v) => { if (!done) { done = true; clearTimeout(timer); fn(v); } };
    const timer = setTimeout(() => { try { child && child.kill(); } catch { /* ignore */ } finish(reject, new Error('timeout')); }, timeoutMs);
    try { child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, [RECURSION_GUARD_ENV]: '1' } }); }
    catch (e) { return finish(reject, e); }
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', (e) => finish(reject, e));
    child.on('close', (code) => {
      // A non-zero exit means the tool failed (e.g. `claude` not logged in) —
      // whatever it printed is an error message, not a summary. Attach it so
      // callers can classify the failure (see isAuthFailure).
      if (typeof code === 'number' && code !== 0) {
        const e = new Error(`exit ${code}`);
        e.stdout = out.trim();
        return finish(reject, e);
      }
      const t = out.trim(); t ? finish(resolve, t) : finish(reject, new Error('empty'));
    });
    if (input != null) { try { child.stdin.write(input); child.stdin.end(); } catch { /* ignore */ } }
  });
}

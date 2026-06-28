import { execFileSync } from 'node:child_process';
import { postJson } from './http.mjs';

export function decidePresenceAction({ active, registered, lastRegisterMs, now, heartbeatMs }) {
  if (active && (!registered || now - lastRegisterMs >= heartbeatMs)) return 'register';
  if (!active && registered) return 'deregister';
  return 'noop';
}

function pgrepHerdrRemote(remoteHost) {
  try {
    const out = execFileSync('pgrep', ['-fl', 'herdr'], { encoding: 'utf8' });
    return out.split('\n').some((l) =>
      /--remote/.test(l) && (!remoteHost || l.includes(remoteHost)));
  } catch { return false; }
}

function myTailscaleIp() {
  try { return execFileSync('tailscale', ['ip', '-4'], { encoding: 'utf8' }).split('\n')[0].trim(); }
  catch { return ''; }
}

export function startPresenceWatcher({ getConfig, log, intervalMs = 7000, heartbeatMs = 30_000 }) {
  let registered = false;
  let lastRegisterMs = 0;
  const ip = myTailscaleIp();
  const tick = async () => {
    const cfg = getConfig();
    const active = pgrepHerdrRemote(cfg.remoteHost);
    const action = decidePresenceAction({ active, registered, lastRegisterMs, now: Date.now(), heartbeatMs });
    const base = `http://${cfg.host}:${cfg.port}`;
    try {
      if (action === 'register') {
        await postJson(`${base}/register`, { ip, port: cfg.port }, { token: cfg.token, timeoutMs: cfg.postTimeoutMs });
        if (!registered) log('INFO', `REGISTER ${ip}:${cfg.port} -> ${base}`);
        registered = true; lastRegisterMs = Date.now();
      } else if (action === 'deregister') {
        await postJson(`${base}/deregister`, {}, { token: cfg.token, timeoutMs: cfg.postTimeoutMs });
        log('INFO', `DEREGISTER -> ${base}`);
        registered = false;
      }
    } catch (e) { log('WARN', `presence ${action} failed: ${e.message}`); }
  };
  const handle = setInterval(tick, intervalMs);
  tick();
  return handle;
}

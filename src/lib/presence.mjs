import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { postJson } from './http.mjs';

// Decide whether to (re)register, deregister, or do nothing given the current
// remote-session presence and when we last registered (heartbeat refresh).
export function decidePresenceAction({ active, registered, lastRegisterMs, now, heartbeatMs }) {
  if (active && (!registered || now - lastRegisterMs >= heartbeatMs)) return 'register';
  if (!active && registered) return 'deregister';
  return 'noop';
}

// Pick the Tailscale IP (CGNAT range 100.64.0.0/10) straight from the network
// interfaces — no dependency on the `tailscale` CLI being on PATH (launchd runs
// with a minimal PATH where `tailscale` is usually not found).
export function pickTailscaleIp(interfaces) {
  for (const addrs of Object.values(interfaces || {})) {
    for (const a of addrs || []) {
      if (a && a.family === 'IPv4' && !a.internal) {
        const [o1, o2] = a.address.split('.').map(Number);
        if (o1 === 100 && o2 >= 64 && o2 <= 127) return a.address;
      }
    }
  }
  return '';
}

// True if a `herdr --remote` session is running locally (optionally matching
// remoteHost) — i.e. the user is present at a paired remote device.
function pgrepHerdrRemote(remoteHost) {
  try {
    const out = execFileSync('pgrep', ['-fl', 'herdr'], { encoding: 'utf8' });
    return out.split('\n').some((l) =>
      /--remote/.test(l) && (!remoteHost || l.includes(remoteHost)));
  } catch { return false; }
}

// This host's Tailscale IP: read it from the interfaces, falling back to the CLI.
function myTailscaleIp() {
  const fromIfaces = pickTailscaleIp(networkInterfaces());
  if (fromIfaces) return fromIfaces;
  // fallback to the CLI if it happens to be on PATH
  try { return execFileSync('tailscale', ['ip', '-4'], { encoding: 'utf8' }).split('\n')[0].trim(); }
  catch { return ''; }
}

// Poll for remote presence on an interval and register/deregister this sink
// with the host router accordingly. Returns the setInterval handle.
export function startPresenceWatcher({ getConfig, log, intervalMs = 7000, heartbeatMs = 30_000 }) {
  let registered = false;
  let lastRegisterMs = 0;
  const tick = async () => {
    const cfg = getConfig();
    const active = pgrepHerdrRemote(cfg.remoteHost);
    const action = decidePresenceAction({ active, registered, lastRegisterMs, now: Date.now(), heartbeatMs });
    const base = `http://${cfg.host}:${cfg.port}`;
    try {
      if (action === 'register') {
        const ip = myTailscaleIp();
        if (!ip) { log('WARN', 'presence_register_skipped', { reason: 'no_tailscale_ip' }); return; }
        await postJson(`${base}/register`, { ip, port: cfg.port }, { token: cfg.token, timeoutMs: cfg.postTimeoutMs });
        if (!registered) log('INFO', 'presence_register', { ip, port: cfg.port, target: base });
        registered = true; lastRegisterMs = Date.now();
      } else if (action === 'deregister') {
        await postJson(`${base}/deregister`, {}, { token: cfg.token, timeoutMs: cfg.postTimeoutMs });
        log('INFO', 'presence_deregister', { target: base });
        registered = false;
      }
    } catch (e) { log('WARN', 'presence_failed', { action, error: e.message }); }
  };
  const handle = setInterval(tick, intervalMs);
  tick();
  return handle;
}

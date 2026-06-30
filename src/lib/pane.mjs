import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Per-pane voice overrides are keyed by the herdr pane id (HERDR_PANE_ID),
// sanitized to a filename-safe form. The toggle action (bash) and these hooks
// MUST sanitize identically: every non-alphanumeric character -> '_'.
export function paneKey(paneId) {
  return (paneId || '').replace(/[^A-Za-z0-9]/g, '_');
}

function panesDir() {
  return join(homedir(), '.herdr-voice', 'panes');
}

// Per-pane override: 'on' | 'off' | null (inherit the global flag).
export function readPaneOverride(paneId, dir = panesDir()) {
  if (!paneId) return null;
  try {
    const v = readFileSync(join(dir, paneKey(paneId)), 'utf8').trim();
    return v === 'on' ? 'on' : v === 'off' ? 'off' : null;
  } catch { return null; }
}

// Effective voice state for the current pane.
//   1. config.enabled is the global master switch — off ⇒ silence everything.
//   2. an explicit per-pane override (on/off) wins next.
//   3. with no override: outside herdr (no pane id) follow the master; inside
//      herdr fall back to config.sessionDefault ('on' = talk, 'off' = opt-in).
export function voiceEnabledForPane(cfg, { paneId = process.env.HERDR_PANE_ID, dir } = {}) {
  if (!(cfg && cfg.enabled)) return false;
  const ov = readPaneOverride(paneId, dir || panesDir());
  if (ov === 'on') return true;
  if (ov === 'off') return false;
  if (!paneId) return true;
  return (cfg.sessionDefault || 'on') === 'on';
}

// Is THIS pane the one the user is currently looking at? Asks herdr for the
// pane's `focused` flag over its socket API. Returns true ONLY on a definite
// focused match; any uncertainty (outside herdr, herdr CLI not on PATH, socket
// error, malformed output) yields false so the caller speaks by default. Used
// to mute the foreground session — you watch that one finish yourself.
export function paneIsFocused(paneId = process.env.HERDR_PANE_ID, {
  exec = (file, args) => execFileSync(file, args, { encoding: 'utf8', timeout: 1000 }),
} = {}) {
  if (!paneId) return false;
  try {
    return JSON.parse(exec('herdr', ['pane', 'get', paneId]))?.result?.pane?.focused === true;
  } catch { return false; }
}

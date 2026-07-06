import { readFileSync, readdirSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Per-pane voice overrides are keyed by the herdr pane id (HERDR_PANE_ID),
// sanitized to a filename-safe form. The toggle action (bash) and these hooks
// MUST sanitize identically: every non-alphanumeric character -> '_'.
export function paneKey(paneId) {
  return (paneId || '').replace(/[^A-Za-z0-9]/g, '_');
}

export function panesDir() {
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

// Every valid override file under `dir`, keyed by the sanitized pane key.
// Unreadable/garbage files and a missing dir are treated as "no override".
export function listPaneOverrides(dir = panesDir()) {
  const map = {};
  let names = [];
  try { names = readdirSync(dir); } catch { return map; }
  for (const name of names) {
    try {
      const v = readFileSync(join(dir, name), 'utf8').trim();
      if (v === 'on' || v === 'off') map[name] = v;
    } catch { /* skip unreadable entries */ }
  }
  return map;
}

// Set or clear a per-pane override: 'on'/'off' writes the file, anything else
// removes it so the pane inherits the global behaviour again.
export function writePaneOverride(paneId, override, dir = panesDir()) {
  if (!paneId) return;
  const file = join(dir, paneKey(paneId));
  if (override === 'on' || override === 'off') {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, override);
  } else {
    try { unlinkSync(file); } catch { /* already absent */ }
  }
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

// Human-readable names for the current herdr location, resolved over the herdr
// socket API: the workspace label, the tab label, and the pane's foreground
// process cwd (panes have no label of their own in herdr). Best-effort — a
// missing id skips its lookup, and any failure (outside herdr, CLI not on
// PATH, socket error, malformed output) yields '' for that field, so callers
// never block or throw on it.
export function herdrNames({
  workspaceId = process.env.HERDR_WORKSPACE_ID,
  tabId = process.env.HERDR_TAB_ID,
  paneId = process.env.HERDR_PANE_ID,
  exec = (file, args) => execFileSync(file, args, { encoding: 'utf8', timeout: 1000 }),
} = {}) {
  const lookup = (id, args, pick) => {
    if (!id) return '';
    try { return String(pick(JSON.parse(exec('herdr', args))) ?? ''); } catch { return ''; }
  };
  return {
    workspaceName: lookup(workspaceId, ['workspace', 'get', workspaceId], (j) => j?.result?.workspace?.label),
    tabName: lookup(tabId, ['tab', 'get', tabId], (j) => j?.result?.tab?.label),
    paneCwd: lookup(paneId, ['pane', 'get', paneId], (j) => j?.result?.pane?.foreground_cwd),
  };
}

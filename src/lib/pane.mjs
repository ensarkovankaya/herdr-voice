import { readFileSync } from 'node:fs';
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

// Effective voice state for the current pane: a per-pane override wins,
// otherwise inherit the global config.enabled.
export function voiceEnabledForPane(cfg, { paneId = process.env.HERDR_PANE_ID, dir } = {}) {
  const ov = readPaneOverride(paneId, dir || panesDir());
  if (ov === 'on') return true;
  if (ov === 'off') return false;
  return !!(cfg && cfg.enabled);
}

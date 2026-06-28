import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, configPath } from '../src/lib/config.mjs';

test('default yol ~/.herdr-voice/config.json', () => {
  delete process.env.HERD_VOICE_CONFIG;
  assert.equal(configPath(), join(homedir(), '.herdr-voice', 'config.json'));
});

test('missing file → defaults (role=host dahil)', () => {
  process.env.HERD_VOICE_CONFIG = join(mkdtempSync(join(tmpdir(), 'hv-')), 'nope.json');
  const c = loadConfig();
  assert.equal(c.port, 8973);
  assert.equal(c.voice, 'Yelda');
  assert.equal(c.enabled, false);
  assert.equal(c.role, 'host');
  assert.equal(c.remoteHost, '');
});

test('partial file merges over defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hv-'));
  const p = join(dir, 'config.json');
  writeFileSync(p, JSON.stringify({ token: 'abc', role: 'remote', remoteHost: 'mac-m4-jftf', port: 9001 }));
  process.env.HERD_VOICE_CONFIG = p;
  const c = loadConfig();
  assert.equal(c.token, 'abc');
  assert.equal(c.role, 'remote');
  assert.equal(c.remoteHost, 'mac-m4-jftf');
  assert.equal(c.port, 9001);
  assert.equal(c.voice, 'Yelda');
});

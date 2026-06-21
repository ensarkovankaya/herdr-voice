import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/lib/config.mjs';

test('missing file → defaults', () => {
  process.env.HERD_VOICE_CONFIG = join(mkdtempSync(join(tmpdir(), 'hv-')), 'nope.json');
  const c = loadConfig();
  assert.equal(c.port, 8973);
  assert.equal(c.voice, 'Yelda');
  assert.equal(c.enabled, false);
});

test('partial file merges over defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hv-'));
  const p = join(dir, 'config.json');
  writeFileSync(p, JSON.stringify({ token: 'abc', enabled: true, port: 9001 }));
  process.env.HERD_VOICE_CONFIG = p;
  const c = loadConfig();
  assert.equal(c.token, 'abc');
  assert.equal(c.enabled, true);
  assert.equal(c.port, 9001);
  assert.equal(c.voice, 'Yelda'); // default korunur
});

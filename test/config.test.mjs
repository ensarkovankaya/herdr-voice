import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, configPath } from '../src/lib/config.mjs';

function writeCfg(obj) {
  const p = join(mkdtempSync(join(tmpdir(), 'hv-')), 'config.json');
  writeFileSync(p, JSON.stringify(obj));
  process.env.HERD_VOICE_CONFIG = p;
  return p;
}

test('default path is ~/.herdr-voice/config.json', () => {
  delete process.env.HERD_VOICE_CONFIG;
  assert.equal(configPath(), join(homedir(), '.herdr-voice', 'config.json'));
});

test('missing file → defaults (English pack, role=host)', () => {
  process.env.HERD_VOICE_CONFIG = join(mkdtempSync(join(tmpdir(), 'hv-')), 'nope.json');
  const c = loadConfig();
  assert.equal(c.port, 8973);
  assert.equal(c.language, 'en');
  assert.equal(c.voice, 'Samantha');
  assert.equal(c.enabled, false);
  assert.equal(c.role, 'host');
  assert.equal(c.remoteHost, '');
  assert.equal(c.cue, 'Approval needed.');
  assert.equal(c.fallback, 'Done.');
  assert.equal(c.voiceOnText, 'Voice on.');
  assert.equal(c.voiceOffText, 'Voice off.');
});

test('partial file merges over defaults', () => {
  writeCfg({ token: 'abc', role: 'remote', remoteHost: 'mac-host', port: 9001 });
  const c = loadConfig();
  assert.equal(c.token, 'abc');
  assert.equal(c.role, 'remote');
  assert.equal(c.remoteHost, 'mac-host');
  assert.equal(c.port, 9001);
  assert.equal(c.voice, 'Samantha');
});

test('language=tr selects the Turkish spoken-string pack', () => {
  writeCfg({ language: 'tr' });
  const c = loadConfig();
  assert.equal(c.cue, 'Onayın gerekiyor.');
  assert.equal(c.fallback, 'Tamamlandı.');
  assert.equal(c.voiceOnText, 'Ses açıldı.');
  assert.equal(c.voiceOffText, 'Ses kapandı.');
});

test('explicit string fields override the language pack', () => {
  writeCfg({ language: 'tr', cue: 'Custom cue.', voiceOnText: 'On!' });
  const c = loadConfig();
  assert.equal(c.cue, 'Custom cue.');
  assert.equal(c.voiceOnText, 'On!');
  assert.equal(c.fallback, 'Tamamlandı.'); // still from the tr pack
});

test('unknown language falls back to the English pack', () => {
  writeCfg({ language: 'xx' });
  const c = loadConfig();
  assert.equal(c.cue, 'Approval needed.');
});

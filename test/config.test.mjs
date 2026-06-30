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
  assert.equal(c.tts.say.voice, 'Samantha');
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
  assert.equal(c.tts.say.voice, 'Samantha');
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

function withConfig(obj, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'hv-cfg-'));
  const p = join(dir, 'config.json');
  writeFileSync(p, JSON.stringify(obj));
  const prev = process.env.HERD_VOICE_CONFIG;
  process.env.HERD_VOICE_CONFIG = p;
  try { return fn(); } finally { if (prev === undefined) delete process.env.HERD_VOICE_CONFIG; else process.env.HERD_VOICE_CONFIG = prev; }
}

test('loadConfig: nested defaults present', () => withConfig({}, () => {
  const c = loadConfig();
  assert.equal(c.tts.provider, 'say');
  assert.equal(c.tts.say.voice, 'Samantha');
  assert.equal(c.tts.gemini.model, 'gemini-2.5-flash-preview-tts');
  assert.equal(c.audio.player, 'auto');
  assert.equal(c.summarize.mode, 'heuristic');
  assert.equal(c.summarize.maxLen, 240);
  assert.deepEqual(c.summarize.claude, {});
}));

test('loadConfig: tts.providers defaults to [provider] (backward compatible)', () => withConfig({ tts: { provider: 'piper' } }, () => {
  assert.deepEqual(loadConfig().tts.providers, ['piper']);
}));

test('loadConfig: explicit tts.providers fallback order is preserved', () => withConfig({ tts: { providers: ['gemini', 'piper', 'say'] } }, () => {
  assert.deepEqual(loadConfig().tts.providers, ['gemini', 'piper', 'say']);
}));

test('loadConfig: no tts block → say defaults (no v1 migration)', () => withConfig({ voice: 'Daniel' }, () => {
  const c = loadConfig();
  assert.equal(c.tts.provider, 'say');
  assert.equal(c.tts.say.voice, 'Samantha'); // flat v1 `voice` is ignored, not migrated
}));

test('loadConfig: summarize.recap defaults present + recapTemplate', () => withConfig({}, () => {
  const c = loadConfig();
  assert.equal(c.summarize.recap.enabled, true);
  assert.equal(c.summarize.recap.everyTurns, 5);
  assert.equal(c.summarize.recap.maxLen, 60);
  assert.equal(c.summarize.recap.pruneAfterDays, 30);
  assert.equal(c.recapTemplate, '${recap}: ${body}');
}));

test('loadConfig: partial recap merges over defaults', () => withConfig({ summarize: { recap: { everyTurns: 3 } } }, () => {
  const c = loadConfig();
  assert.equal(c.summarize.recap.everyTurns, 3);   // overridden
  assert.equal(c.summarize.recap.enabled, true);   // default preserved
  assert.equal(c.summarize.recap.maxLen, 60);      // default preserved
}));

test('loadConfig: recapTemplate overridable', () => withConfig({ recapTemplate: '${recap} — ${body}' }, () => {
  assert.equal(loadConfig().recapTemplate, '${recap} — ${body}');
}));

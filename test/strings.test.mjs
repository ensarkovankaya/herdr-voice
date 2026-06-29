import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stringsFor, availableLanguages } from '../src/lib/strings.mjs';

test('stringsFor: English pack', () => {
  const s = stringsFor('en');
  assert.equal(s.cue, 'Approval needed.');
  assert.equal(s.fallback, 'Done.');
  assert.equal(s.voiceOn, 'Voice on.');
  assert.equal(s.voiceOff, 'Voice off.');
});

test('stringsFor: Turkish pack (UTF-8 preserved)', () => {
  const s = stringsFor('tr');
  assert.equal(s.cue, 'Onayın gerekiyor.');
  assert.equal(s.fallback, 'Tamamlandı.');
  assert.equal(s.voiceOn, 'Ses açıldı.');
  assert.equal(s.voiceOff, 'Ses kapandı.');
});

test('stringsFor: unknown language falls back to the English pack', () => {
  assert.deepEqual(stringsFor('xx'), stringsFor('en'));
});

test('stringsFor: every pack carries all English keys (per-key fallback)', () => {
  const enKeys = Object.keys(stringsFor('en')).sort();
  for (const lang of availableLanguages()) {
    const keys = Object.keys(stringsFor(lang)).sort();
    assert.deepEqual(keys, enKeys, `pack "${lang}" is missing keys`);
  }
});

test('availableLanguages lists the locale files on disk', () => {
  const langs = availableLanguages();
  assert.ok(langs.includes('en'));
  assert.ok(langs.includes('tr'));
});

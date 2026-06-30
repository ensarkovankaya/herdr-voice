import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paneKey, readPaneOverride, voiceEnabledForPane, paneIsFocused } from '../src/lib/pane.mjs';

test('paneKey sanitizes non-alphanumerics to _', () => {
  assert.equal(paneKey('w653aa39818c041:p4'), 'w653aa39818c041_p4');
  assert.equal(paneKey(''), '');
  assert.equal(paneKey(undefined), '');
});

test('readPaneOverride reads on/off, else null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hvpane-'));
  writeFileSync(join(dir, paneKey('w1:p2')), 'off\n');
  writeFileSync(join(dir, paneKey('w1:p3')), 'on');
  writeFileSync(join(dir, paneKey('w1:p4')), 'garbage');
  assert.equal(readPaneOverride('w1:p2', dir), 'off');
  assert.equal(readPaneOverride('w1:p3', dir), 'on');
  assert.equal(readPaneOverride('w1:p4', dir), null);
  assert.equal(readPaneOverride('w1:p9', dir), null); // missing file
  assert.equal(readPaneOverride('', dir), null);      // no pane id
});

test('master switch off silences everything', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hvpane-'));
  writeFileSync(join(dir, paneKey('w1:on')), 'on');
  assert.equal(voiceEnabledForPane({ enabled: false }, { paneId: 'w1:on', dir }), false);
  assert.equal(voiceEnabledForPane({ enabled: false }, { paneId: '', dir }), false);
});

test('explicit per-pane override wins (master on)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hvpane-'));
  writeFileSync(join(dir, paneKey('w1:on')), 'on');
  writeFileSync(join(dir, paneKey('w1:off')), 'off');
  assert.equal(voiceEnabledForPane({ enabled: true, sessionDefault: 'off' }, { paneId: 'w1:on', dir }), true);
  assert.equal(voiceEnabledForPane({ enabled: true, sessionDefault: 'on' }, { paneId: 'w1:off', dir }), false);
});

test('no override under herdr falls back to sessionDefault', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hvpane-'));
  assert.equal(voiceEnabledForPane({ enabled: true, sessionDefault: 'off' }, { paneId: 'w1:x', dir }), false);
  assert.equal(voiceEnabledForPane({ enabled: true, sessionDefault: 'on' }, { paneId: 'w1:x', dir }), true);
  assert.equal(voiceEnabledForPane({ enabled: true }, { paneId: 'w1:x', dir }), true); // default 'on'
});

test('no pane id (outside herdr) follows the master', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hvpane-'));
  assert.equal(voiceEnabledForPane({ enabled: true, sessionDefault: 'off' }, { paneId: '', dir }), true);
  assert.equal(voiceEnabledForPane({ enabled: false }, { paneId: '', dir }), false);
});

test('paneIsFocused: true only when herdr reports the pane focused', () => {
  const focused = () => JSON.stringify({ result: { pane: { focused: true } } });
  const notFocused = () => JSON.stringify({ result: { pane: { focused: false } } });
  assert.equal(paneIsFocused('w1:p4', { exec: focused }), true);
  assert.equal(paneIsFocused('w1:p4', { exec: notFocused }), false);
});

test('paneIsFocused: false without a pane id (outside herdr), never shells out', () => {
  assert.equal(paneIsFocused('', { exec: () => { throw new Error('should not run'); } }), false);
});

test('paneIsFocused: false when herdr is unavailable or its output is unusable', () => {
  assert.equal(paneIsFocused('w1:p4', { exec: () => { throw new Error('ENOENT'); } }), false); // herdr not on PATH / socket down
  assert.equal(paneIsFocused('w1:p4', { exec: () => 'not json' }), false);
  assert.equal(paneIsFocused('w1:p4', { exec: () => JSON.stringify({ result: {} }) }), false);
});

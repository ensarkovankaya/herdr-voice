import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paneKey, readPaneOverride, voiceEnabledForPane } from '../src/lib/pane.mjs';

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

test('voiceEnabledForPane: override wins, else inherits global', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hvpane-'));
  writeFileSync(join(dir, paneKey('w1:p2')), 'off');
  writeFileSync(join(dir, paneKey('w1:p3')), 'on');
  assert.equal(voiceEnabledForPane({ enabled: true }, { paneId: 'w1:p2', dir }), false);  // off override
  assert.equal(voiceEnabledForPane({ enabled: false }, { paneId: 'w1:p3', dir }), true);  // on override
  assert.equal(voiceEnabledForPane({ enabled: true }, { paneId: 'w1:p9', dir }), true);   // inherit global=true
  assert.equal(voiceEnabledForPane({ enabled: false }, { paneId: 'w1:p9', dir }), false); // inherit global=false
  assert.equal(voiceEnabledForPane({ enabled: true }, { paneId: '', dir }), true);        // no pane → global
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paneKey, readPaneOverride, voiceEnabledForPane, paneIsFocused, listPaneOverrides, writePaneOverride, herdrNames } from '../src/lib/pane.mjs';

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

test('herdrNames resolves workspace/tab labels and pane cwd over the herdr CLI', () => {
  const exec = (file, args) => {
    assert.equal(file, 'herdr');
    if (args[0] === 'workspace') return JSON.stringify({ result: { workspace: { label: 'General' } } });
    if (args[0] === 'tab') return JSON.stringify({ result: { tab: { label: 'Herdr Voice' } } });
    return JSON.stringify({ result: { pane: { foreground_cwd: '/Users/x/proj' } } });
  };
  assert.deepEqual(herdrNames({ workspaceId: 'w1', tabId: 'w1:t3', paneId: 'w1:p4', exec }),
    { workspaceName: 'General', tabName: 'Herdr Voice', paneCwd: '/Users/x/proj' });
});

test('herdrNames: missing ids skip their lookup, never shell out for them', () => {
  const calls = [];
  const exec = (file, args) => { calls.push(args[0]); return JSON.stringify({ result: { tab: { label: 'T' } } }); };
  assert.deepEqual(herdrNames({ workspaceId: '', tabId: 'w1:t1', paneId: '', exec }),
    { workspaceName: '', tabName: 'T', paneCwd: '' });
  assert.deepEqual(calls, ['tab']);
  assert.deepEqual(herdrNames({ workspaceId: '', tabId: '', paneId: '', exec: () => { throw new Error('should not run'); } }),
    { workspaceName: '', tabName: '', paneCwd: '' });
});

test('herdrNames: CLI errors and unusable output yield empty strings', () => {
  assert.deepEqual(herdrNames({ workspaceId: 'w1', tabId: 't1', paneId: 'p1', exec: () => { throw new Error('ENOENT'); } }),
    { workspaceName: '', tabName: '', paneCwd: '' });
  assert.deepEqual(herdrNames({ workspaceId: 'w1', tabId: 't1', paneId: 'p1', exec: () => 'not json' }),
    { workspaceName: '', tabName: '', paneCwd: '' });
  assert.deepEqual(herdrNames({ workspaceId: 'w1', tabId: 't1', paneId: 'p1', exec: () => JSON.stringify({ result: {} }) }),
    { workspaceName: '', tabName: '', paneCwd: '' });
});

test('listPaneOverrides maps override files, skips garbage, missing dir → {}', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hvpane-'));
  writeFileSync(join(dir, paneKey('w1:p1')), 'on');
  writeFileSync(join(dir, paneKey('w1:p2')), 'off\n');
  writeFileSync(join(dir, paneKey('w1:p3')), 'garbage');
  assert.deepEqual(listPaneOverrides(dir), { w1_p1: 'on', w1_p2: 'off' });
  assert.deepEqual(listPaneOverrides(join(dir, 'nope')), {});
});

test('writePaneOverride writes on/off and clears on null; missing paneId is a no-op', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hvpane-'));
  writePaneOverride('w1:p9', 'on', dir);
  assert.equal(readFileSync(join(dir, paneKey('w1:p9')), 'utf8'), 'on');
  assert.equal(readPaneOverride('w1:p9', dir), 'on');
  writePaneOverride('w1:p9', 'off', dir);
  assert.equal(readPaneOverride('w1:p9', dir), 'off');
  writePaneOverride('w1:p9', null, dir);
  assert.equal(existsSync(join(dir, paneKey('w1:p9'))), false);
  writePaneOverride('w1:p9', null, dir);            // clearing twice is fine
  writePaneOverride('', 'on', dir);                 // no pane id → no file
  assert.deepEqual(listPaneOverrides(dir), {});
});

test('writePaneOverride creates the panes dir on demand', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'hvpane-')), 'panes');
  writePaneOverride('w2:p1', 'off', dir);
  assert.equal(readPaneOverride('w2:p1', dir), 'off');
});

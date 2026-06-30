import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sessionKey, readSession, writeSession, pruneOld } from '../src/lib/session-store.mjs';

test('sessionKey sanitizes to alphanumerics + underscore', () => {
  assert.equal(sessionKey('a/b-c.d'), 'a_b_c_d');
  assert.equal(sessionKey(''), '');
});

test('readSession returns {} for missing/invalid/empty id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hv-ss-'));
  assert.deepEqual(readSession('nope', { dir }), {});
  assert.deepEqual(readSession('', { dir }), {});
});

test('writeSession then readSession roundtrips', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hv-ss-'));
  writeSession('sess-1', { prefix: 'Search app', turnsSinceRecap: 2 }, { dir });
  assert.deepEqual(readSession('sess-1', { dir }), { prefix: 'Search app', turnsSinceRecap: 2 });
});

test('writeSession swallows write errors', () => {
  assert.doesNotThrow(() => writeSession('x', { a: 1 }, {
    mkdir: () => {}, write: () => { throw new Error('EACCES'); }, dir: '/x',
  }));
});

test('pruneOld deletes only .json files older than days', () => {
  const removed = [];
  const NOW = 1_000_000_000_000;
  const day = 24 * 60 * 60 * 1000;
  pruneOld(NOW, 30, {
    dir: '/s',
    readdir: () => ['fresh.json', 'old.json', 'note.txt'],
    stat: (p) => ({ mtimeMs: p.endsWith('old.json') ? NOW - 40 * day : NOW - 1 * day }),
    rm: (p) => removed.push(p),
  });
  assert.deepEqual(removed, ['/s/old.json']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadHistory, appendHistory } from '../src/lib/history.mjs';

test('loadHistory returns the last `max` parsed entries, skipping corrupt lines', () => {
  const raw = ['{"id":1}', 'CORRUPT', '{"id":2}', '{"id":3}'].join('\n') + '\n';
  const out = loadHistory('/ignored', { max: 2, read: () => raw });
  assert.deepEqual(out, [{ id: 2 }, { id: 3 }]);
});

test('loadHistory returns [] when the file is missing', () => {
  const out = loadHistory('/nope', { read: () => { throw new Error('ENOENT'); } });
  assert.deepEqual(out, []);
});

test('appendHistory writes one JSON line and ensures the dir', () => {
  const writes = []; const dirs = [];
  appendHistory('/tmp/h.jsonl', { id: 7 }, {
    append: (p, s) => writes.push([p, s]),
    mkdir: (d) => dirs.push(d),
  });
  assert.deepEqual(dirs, ['/tmp']);
  assert.deepEqual(writes, [['/tmp/h.jsonl', '{"id":7}\n']]);
});

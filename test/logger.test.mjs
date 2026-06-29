import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeLogger, metaTag } from '../src/lib/logger.mjs';

test('metaTag formats session/pane and skips empties', () => {
  assert.equal(metaTag({ sessionId: 'a6aff93b-243f-4a28', pane: 'w1:p4' }), ' [sess:a6aff93b pane:w1:p4]');
  assert.equal(metaTag({ sessionId: 'abcd1234' }), ' [sess:abcd1234]');
  assert.equal(metaTag({ pane: 'w1:p4' }), ' [pane:w1:p4]');
  assert.equal(metaTag({}), '');
  assert.equal(metaTag(), '');
});

test('writes a line in the expected format', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'hvlog-')), 'a.log');
  makeLogger({ file: f })('INFO', 'hello');
  assert.match(readFileSync(f, 'utf8'), /\[INFO\] hello/);
});

test('rotates past maxBytes, bounded by keep', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'hvlog-')), 'a.log');
  const log = makeLogger({ file: f, maxBytes: 50, keep: 2 });
  for (let i = 0; i < 20; i++) log('INFO', 'x'.repeat(40) + i);
  assert.ok(existsSync(f));            // current file exists
  assert.ok(existsSync(f + '.1'));     // at least one rotation
  assert.ok(!existsSync(f + '.3'));    // keep=2 → .3 must not exist
});

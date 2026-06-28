import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeLogger } from '../src/lib/logger.mjs';

test('yazar ve format içerir', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'hvlog-')), 'a.log');
  makeLogger({ file: f })('INFO', 'merhaba');
  assert.match(readFileSync(f, 'utf8'), /\[INFO\] merhaba/);
});

test('maxBytes aşılınca rotate eder, keep ile sınırlı', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'hvlog-')), 'a.log');
  const log = makeLogger({ file: f, maxBytes: 50, keep: 2 });
  for (let i = 0; i < 20; i++) log('INFO', 'x'.repeat(40) + i);
  assert.ok(existsSync(f));            // güncel dosya var
  assert.ok(existsSync(f + '.1'));     // en az bir rotate
  assert.ok(!existsSync(f + '.3'));    // keep=2 → .3 olmamalı
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeLogger } from '../src/lib/logger.mjs';

const mkfile = () => join(mkdtempSync(join(tmpdir(), 'hvlog-')), 'a.log');

test('writes one JSON object per line with ts/level/event + fields', () => {
  const f = mkfile();
  makeLogger({ file: f })('INFO', 'speak', { text: 'hello', pane: 'w1:p4' });
  const rec = JSON.parse(readFileSync(f, 'utf8').trim());
  assert.equal(rec.level, 'INFO');
  assert.equal(rec.event, 'speak');
  assert.equal(rec.text, 'hello');
  assert.equal(rec.pane, 'w1:p4');
  assert.match(rec.ts, /^\d{4}-\d{2}-\d{2}T.*Z$/);
});

test('omits null/undefined fields', () => {
  const f = mkfile();
  makeLogger({ file: f })('INFO', 'forward', { text: 'hi', sessionId: undefined, pane: null });
  const rec = JSON.parse(readFileSync(f, 'utf8').trim());
  assert.equal(rec.text, 'hi');
  assert.ok(!('sessionId' in rec));
  assert.ok(!('pane' in rec));
});

test('each line is independently parseable (NDJSON)', () => {
  const f = mkfile();
  const log = makeLogger({ file: f });
  log('INFO', 'start', { service: 'voice-router' });
  log('WARN', 'fallback_local', { target: '1.2.3.4:8973' });
  const lines = readFileSync(f, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).event, 'start');
  assert.equal(JSON.parse(lines[1]).level, 'WARN');
});

test('defaults to empty fields when omitted', () => {
  const f = mkfile();
  makeLogger({ file: f })('INFO', 'deregister');
  const rec = JSON.parse(readFileSync(f, 'utf8').trim());
  assert.equal(rec.event, 'deregister');
});

test('rotates past maxBytes, bounded by keep', () => {
  const f = mkfile();
  const log = makeLogger({ file: f, maxBytes: 50, keep: 2 });
  for (let i = 0; i < 20; i++) log('INFO', 'fill', { i });
  assert.ok(existsSync(f));            // current file exists
  assert.ok(existsSync(f + '.1'));     // at least one rotation
  assert.ok(!existsSync(f + '.3'));    // keep=2 → .3 must not exist
});

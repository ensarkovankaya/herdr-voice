import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { extractLastAssistantText, readSettledFile } from '../src/speak-summary.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('skips a tool_use-only last line, takes the last assistant text message', () => {
  const jsonl = readFileSync(join(here, 'fixtures', 'transcript.jsonl'), 'utf8');
  assert.equal(extractLastAssistantText(jsonl), 'I ran the tests and they all passed.');
});

test('string content and malformed lines', () => {
  const jsonl = [
    'MALFORMED LINE',
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'Plain text reply.' } }),
  ].join('\n');
  assert.equal(extractLastAssistantText(jsonl), 'Plain text reply.');
});

test('no assistant message → empty string', () => {
  assert.equal(extractLastAssistantText('{"type":"user","message":{"role":"user","content":[]}}'), '');
});

test('readSettledFile waits for the file to stop growing, then reads', async () => {
  const sizes = [10, 20, 30, 30, 30]; // grows while the final message flushes, then settles
  let i = 0; let readAt = -1;
  const out = await readSettledFile('x', {
    size: () => sizes[Math.min(i++, sizes.length - 1)],
    read: () => { readAt = i; return 'FINAL'; },
    sleep: async () => {},
    gapMs: 0, minChecks: 3, stableNeeded: 2, maxChecks: 14,
  });
  assert.equal(out, 'FINAL');
  assert.ok(readAt >= 5); // didn't read until size had settled
});

test('readSettledFile returns null on unreadable file', async () => {
  const out = await readSettledFile('x', {
    size: () => 0, read: () => { throw new Error('nope'); }, sleep: async () => {},
    gapMs: 0, minChecks: 1, stableNeeded: 1, maxChecks: 2,
  });
  assert.equal(out, null);
});

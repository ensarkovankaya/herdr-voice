import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { extractLastAssistantText } from '../src/speak-summary.mjs';

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

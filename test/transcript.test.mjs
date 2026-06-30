import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractNewTurns } from '../src/lib/transcript.mjs';

const line = (o) => JSON.stringify(o);

test('extractNewTurns returns only turns appended after the offset', () => {
  const head = line({ type: 'user', message: { role: 'user', content: 'old request' } }) + '\n';
  const tail = [
    line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'new reply' }] } }),
    line({ type: 'user', message: { role: 'user', content: 'follow up' } }),
  ].join('\n');
  const jsonl = head + tail;
  assert.equal(extractNewTurns(jsonl, head.length), 'assistant: new reply\nuser: follow up');
});

test('extractNewTurns collects both roles and skips malformed/partial lines', () => {
  const jsonl = [
    'PARTIAL{bad',
    line({ type: 'user', message: { role: 'user', content: 'hi' } }),
    line({ type: 'assistant', message: { role: 'assistant', content: 'ok' } }),
  ].join('\n');
  assert.equal(extractNewTurns(jsonl, 0), 'user: hi\nassistant: ok');
});

test('extractNewTurns with no new content returns empty string', () => {
  const jsonl = line({ type: 'assistant', message: { role: 'assistant', content: 'x' } });
  assert.equal(extractNewTurns(jsonl, jsonl.length), '');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractNewTurns, isSubagentTranscript } from '../src/lib/transcript.mjs';

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

test('isSubagentTranscript: true only for sdk-cli entrypoint', () => {
  // Real shape: queue-operation lines first (no entrypoint), then an
  // attachment line carrying the entrypoint marker.
  const sdk = [
    line({ type: 'queue-operation', operation: 'enqueue', sessionId: 's' }),
    line({ type: 'attachment', entrypoint: 'sdk-cli', userType: 'external', cwd: '/Users/x/AgentWorkspaces/u1' }),
    line({ type: 'assistant', message: { role: 'assistant', content: 'Merhaba!' } }),
  ].join('\n');
  assert.equal(isSubagentTranscript(sdk), true);
  const cli = [
    line({ type: 'queue-operation', operation: 'enqueue', sessionId: 's' }),
    line({ type: 'attachment', entrypoint: 'cli', userType: 'external', cwd: '/Users/x/proj' }),
  ].join('\n');
  assert.equal(isSubagentTranscript(cli), false);
});

test('isSubagentTranscript: first entrypoint wins; unknown values speak as before', () => {
  const mixed = line({ type: 'attachment', entrypoint: 'cli' }) + '\n'
    + line({ type: 'attachment', entrypoint: 'sdk-cli' });
  assert.equal(isSubagentTranscript(mixed), false);
  assert.equal(isSubagentTranscript(line({ type: 'attachment', entrypoint: 'web' })), false);
});

test('isSubagentTranscript: no entrypoint, garbage, or empty input → false', () => {
  assert.equal(isSubagentTranscript(line({ type: 'assistant', message: { role: 'assistant', content: 'x' } })), false);
  assert.equal(isSubagentTranscript('not json\n{broken'), false);
  assert.equal(isSubagentTranscript(''), false);
  assert.equal(isSubagentTranscript(null), false);
});

test('isSubagentTranscript: tolerates a truncated trailing line (bounded head reads)', () => {
  const head = line({ type: 'attachment', entrypoint: 'sdk-cli' }) + '\n'
    + '{"type":"assistant","mess';   // cut mid-line, as a 64KB head read would
  assert.equal(isSubagentTranscript(head), true);
});

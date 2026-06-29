import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSummarizer } from '../src/lib/summarize/index.mjs';

const cfg = (over = {}) => ({ fallback: 'Done.', summarize: { mode: 'heuristic', maxLen: 240, ...over } });

test('heuristic mode (default)', async () => {
  const s = makeSummarizer({});
  assert.equal(await s('**Hi** there', cfg()), 'Hi there');
});

test('llm mode: result sanitized + shortened', async () => {
  const s = makeSummarizer({ getLlm: () => async () => '**Summary** 🎉' });
  assert.equal(await s('whatever', cfg({ mode: 'llm', maxLen: 240 })), 'Summary');
});

test('llm failure falls back to heuristic', async () => {
  const s = makeSummarizer({ getLlm: () => async () => { throw new Error('down'); } });
  assert.equal(await s('Plain text.', cfg({ mode: 'llm' })), 'Plain text.');
});

test('command mode dispatches to getCommand', async () => {
  const s = makeSummarizer({ getCommand: () => async () => 'cmd out' });
  assert.equal(await s('x', cfg({ mode: 'command' })), 'cmd out');
});

test('claude mode dispatches to getClaude', async () => {
  const s = makeSummarizer({ getClaude: () => async () => 'claude out' });
  assert.equal(await s('x', cfg({ mode: 'claude' })), 'claude out');
});

test('claude failure falls back to heuristic', async () => {
  const s = makeSummarizer({ getClaude: () => async () => { throw new Error('down'); } });
  assert.equal(await s('Plain text.', cfg({ mode: 'claude' })), 'Plain text.');
});

test('empty input -> fallback', async () => {
  const s = makeSummarizer({});
  assert.equal(await s('', cfg()), 'Done.');
});

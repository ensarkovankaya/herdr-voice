import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makeCommandSummarizer } from '../src/lib/summarize/command.mjs';

function fakeChild({ out = '', err = false } = {}) {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stdin = { write() {}, end() {} };
  c.kill = () => {};
  setImmediate(() => {
    if (err) return c.emit('error', new Error('spawn fail'));
    if (out) c.stdout.emit('data', Buffer.from(out));
    c.emit('close');
  });
  return c;
}

test('command: interpolates ${text} in args, returns stdout', async () => {
  let captured;
  const spawn = (cmd, args) => { captured = { cmd, args }; return fakeChild({ out: '  a short line  ' }); };
  const fn = makeCommandSummarizer({ spawn });
  const r = await fn('THE TEXT', { summarize: { command: { cmd: 'claude', args: ['-p', 'Sum: ${text}'], timeoutMs: 500 } } });
  assert.equal(r, 'a short line');
  assert.deepEqual(captured, { cmd: 'claude', args: ['-p', 'Sum: THE TEXT'] });
});

test('command: spawn error rejects', async () => {
  const fn = makeCommandSummarizer({ spawn: () => fakeChild({ err: true }) });
  await assert.rejects(fn('x', { summarize: { command: { cmd: 'nope', args: [], timeoutMs: 500 } } }));
});

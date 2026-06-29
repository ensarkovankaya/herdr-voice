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

test('command: child error event rejects', async () => {
  const fn = makeCommandSummarizer({ spawn: () => fakeChild({ err: true }) });
  await assert.rejects(fn('x', { summarize: { command: { cmd: 'nope', args: [], timeoutMs: 500 } } }));
});

test('command: spawn throw rejects', async () => {
  const fn = makeCommandSummarizer({ spawn: () => { throw new Error('ENOENT'); } });
  await assert.rejects(fn('x', { summarize: { command: { cmd: 'nope', args: [], timeoutMs: 500 } } }));
});

test('command: empty stdout rejects', async () => {
  const fn = makeCommandSummarizer({ spawn: () => fakeChild({ out: '' }) });
  await assert.rejects(fn('x', { summarize: { command: { cmd: 'echo', args: [], timeoutMs: 500 } } }));
});

test('command: timeout rejects and kills child', async () => {
  let killed = false;
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdin = { write() {}, end() {} };
  child.kill = () => { killed = true; };
  const fn = makeCommandSummarizer({ spawn: () => child }); // never emits close
  await assert.rejects(fn('x', { summarize: { command: { cmd: 'sleep', args: [], timeoutMs: 10 } } }));
  assert.equal(killed, true);
});

test('command: stdin=true writes text to child stdin', async () => {
  let written = '';
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdin = { write(d) { written += d; }, end() {} };
  child.kill = () => {};
  const spawn = () => { setImmediate(() => { child.stdout.emit('data', Buffer.from('ok')); child.emit('close'); }); return child; };
  const fn = makeCommandSummarizer({ spawn });
  const r = await fn('THE TEXT', { summarize: { command: { cmd: 'claude', args: ['-p'], stdin: true, timeoutMs: 500 } } });
  assert.equal(r, 'ok');
  assert.equal(written, 'THE TEXT');
});

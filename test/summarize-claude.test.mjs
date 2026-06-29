import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makeClaudeSummarizer } from '../src/lib/summarize/claude.mjs';
import { RECURSION_GUARD_ENV } from '../src/lib/summarize/spawn.mjs';

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

test('claude: default cmd/model, text piped to stdin, returns stdout', async () => {
  let captured; let written = '';
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdin = { write(d) { written += d; }, end() {} };
  child.kill = () => {};
  const spawn = (cmd, args) => {
    captured = { cmd, args };
    setImmediate(() => { child.stdout.emit('data', Buffer.from('  one sentence.  ')); child.emit('close'); });
    return child;
  };
  const fn = makeClaudeSummarizer({ spawn });
  const r = await fn('THE MESSAGE', { summarize: { claude: {} } });
  assert.equal(r, 'one sentence.');
  assert.equal(captured.cmd, 'claude');
  assert.equal(captured.args[0], '-p');
  assert.equal(captured.args[1], '--model');
  assert.equal(captured.args[2], 'haiku'); // default model
  assert.equal(written, 'THE MESSAGE');
});

test('claude: model/cmd/prompt overridable from config', async () => {
  let captured;
  const spawn = (cmd, args) => { captured = { cmd, args }; return fakeChild({ out: 'x' }); };
  const fn = makeClaudeSummarizer({ spawn });
  await fn('m', { summarize: { claude: { cmd: 'cc', model: 'sonnet', prompt: 'Say it short.' } } });
  assert.equal(captured.cmd, 'cc');
  assert.deepEqual(captured.args, ['-p', '--model', 'sonnet', 'Say it short.']);
});

test('claude: child is stamped with the recursion-guard env flag', async () => {
  let opts;
  const spawn = (_cmd, _args, o) => { opts = o; return fakeChild({ out: 'x' }); };
  const fn = makeClaudeSummarizer({ spawn });
  await fn('m', { summarize: { claude: {} } });
  assert.equal(opts.env[RECURSION_GUARD_ENV], '1');
  assert.equal(opts.env.PATH, process.env.PATH); // rest of the environment preserved
});

test('claude: child error event rejects', async () => {
  const fn = makeClaudeSummarizer({ spawn: () => fakeChild({ err: true }) });
  await assert.rejects(fn('x', { summarize: { claude: {} } }));
});

test('claude: spawn throw rejects', async () => {
  const fn = makeClaudeSummarizer({ spawn: () => { throw new Error('ENOENT'); } });
  await assert.rejects(fn('x', { summarize: { claude: {} } }));
});

test('claude: empty stdout rejects', async () => {
  const fn = makeClaudeSummarizer({ spawn: () => fakeChild({ out: '' }) });
  await assert.rejects(fn('x', { summarize: { claude: {} } }));
});

test('claude: timeout rejects and kills child', async () => {
  let killed = false;
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdin = { write() {}, end() {} };
  child.kill = () => { killed = true; };
  const fn = makeClaudeSummarizer({ spawn: () => child }); // never emits close
  await assert.rejects(fn('x', { summarize: { claude: { timeoutMs: 10 } } }));
  assert.equal(killed, true);
});

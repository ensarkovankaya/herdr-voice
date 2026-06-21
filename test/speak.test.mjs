import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makeSpeak } from '../src/lib/speak.mjs';

const tick = () => new Promise((r) => setImmediate(r));

test('boş metin spawn etmez', async () => {
  let calls = 0;
  const speak = makeSpeak(() => { calls++; const e = new EventEmitter(); queueMicrotask(() => e.emit('close')); return e; });
  await speak('   ');
  assert.equal(calls, 0);
});

test('çağrılar seri: ikincisi birincisi bitene kadar başlamaz', async () => {
  const emitters = [];
  const speak = makeSpeak((cmd, args) => {
    const e = new EventEmitter(); e._args = args; emitters.push(e); return e;
  });
  speak('bir'); speak('iki');
  await tick();
  assert.equal(emitters.length, 1);
  assert.deepEqual(emitters[0]._args, ['-v', 'Yelda', 'bir']);
  emitters[0].emit('close');
  await tick();
  assert.equal(emitters.length, 2);
  assert.deepEqual(emitters[1]._args, ['-v', 'Yelda', 'iki']);
});

test('3+ seri: üçüncü, ikincisi koşarken başlamaz', async () => {
  const emitters = [];
  const speak = makeSpeak(() => { const e = new EventEmitter(); emitters.push(e); return e; });
  speak('a'); speak('b'); speak('c');
  await tick();
  assert.equal(emitters.length, 1);
  emitters[0].emit('close'); await tick();
  assert.equal(emitters.length, 2);
  emitters[1].emit('close'); await tick();
  assert.equal(emitters.length, 3);
});

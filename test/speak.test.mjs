import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { makeSpeak } from '../src/lib/speak.mjs';

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
  assert.equal(emitters.length, 1);                 // sadece ilki spawn edildi
  assert.deepEqual(emitters[0]._args, ['-v', 'Yelda', 'bir']);
  emitters[0].emit('close');                        // ilki bitti
  await new Promise((r) => setImmediate(r));
  assert.equal(emitters.length, 2);                 // şimdi ikincisi
  assert.deepEqual(emitters[1]._args, ['-v', 'Yelda', 'iki']);
});

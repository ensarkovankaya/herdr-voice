import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../src/lib/summarize.mjs';

test('boş/kod-only → fallback', () => {
  assert.equal(summarize(''), 'Tamamlandı.');
  assert.equal(summarize('```js\nconst x=1;\n```'), 'Tamamlandı.');
});

test('kısa prose olduğu gibi, markdown temizlenir', () => {
  assert.equal(summarize('## Bitti\nTest **geçti**.'), 'Bitti Test geçti.');
});

test('uzun metin ilk cümleyle sınırlanır (≤240)', () => {
  const long = 'Birinci cümle burada. ' + 'x'.repeat(300) + '.';
  const out = summarize(long);
  assert.ok(out.length <= 240);
  assert.ok(out.startsWith('Birinci cümle burada.'));
});

test('kod bloğu atılır, çevresi kalır', () => {
  const out = summarize('İşlem tamam.\n```\nrm -rf /\n```\nDevam.');
  assert.equal(out, 'İşlem tamam. Devam.');
});

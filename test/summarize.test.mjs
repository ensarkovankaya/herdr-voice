import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../src/lib/summarize.mjs';

test('empty / code-only → fallback', () => {
  assert.equal(summarize(''), 'Done.');
  assert.equal(summarize('```js\nconst x=1;\n```'), 'Done.');
});

test('custom fallback is honored', () => {
  assert.equal(summarize('', { fallback: 'All set.' }), 'All set.');
});

test('short prose kept as-is, markdown stripped', () => {
  assert.equal(summarize('## Done\nTests **passed**.'), 'Done Tests passed.');
});

test('long text is limited to the first sentence(s) (≤240)', () => {
  const long = 'First sentence here. ' + 'x'.repeat(300) + '.';
  const out = summarize(long);
  assert.ok(out.length <= 240);
  assert.ok(out.startsWith('First sentence here.'));
});

test('code block is dropped, surrounding text kept', () => {
  const out = summarize('Operation complete.\n```\nrm -rf /\n```\nContinuing.');
  assert.equal(out, 'Operation complete. Continuing.');
});

test('emojis are stripped from spoken text', () => {
  assert.equal(summarize('Done ✅ shipped 🚀'), 'Done shipped');
  assert.equal(summarize('🎉 Tests passed 🔥🔥'), 'Tests passed');
  assert.equal(summarize('Flags 🇹🇷🇬🇧 done'), 'Flags done');
  assert.equal(summarize('Family 👨‍👩‍👧 ok'), 'Family ok');
});

test('emoji-only message → fallback', () => {
  assert.equal(summarize('🎉🚀🔥'), 'Done.');
});

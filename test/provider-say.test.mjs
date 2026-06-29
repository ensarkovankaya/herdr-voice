import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSayProvider } from '../src/lib/tts/providers/say.mjs';

test('say provider: basic speak', async () => {
  const spawned = [];
  const mockSpawn = (cmd, args) => {
    spawned.push({ cmd, args });
    return {
      on(event, fn) {
        if (event === 'close') setImmediate(() => fn(0));
        return this;
      },
    };
  };

  const provider = makeSayProvider({ spawn: mockSpawn });
  assert.equal(provider.name, 'say');

  await provider.speak('hello world', {
    cfg: { tts: { say: { voice: 'Victoria' } } },
  });

  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].cmd, 'say');
  assert.deepEqual(spawned[0].args, ['-v', 'Victoria', 'hello world']);
});

test('say provider: resolves on child close', async () => {
  let closeCallback;
  const mockSpawn = () => ({
    on(event, fn) {
      if (event === 'close') closeCallback = fn;
      return this;
    },
  });

  const provider = makeSayProvider({ spawn: mockSpawn });
  const promise = provider.speak('test', {
    cfg: { tts: { say: { voice: 'Alex' } } },
  });

  assert.equal(typeof closeCallback, 'function');
  closeCallback(0);
  await promise;
});

test('say provider: never throws on spawn error', async () => {
  const mockSpawn = () => {
    let closeCallback;
    const child = {
      on(event, fn) {
        if (event === 'close') closeCallback = fn;
        if (event === 'error') {
          // Simulate error after returning object
          setImmediate(() => fn(new Error('spawn failed')));
        }
        return this;
      },
    };
    // Register error listener right away before returning
    setImmediate(() => child.on('error', () => {}));
    return child;
  };

  const provider = makeSayProvider({ spawn: mockSpawn });
  await provider.speak('test', { cfg: { tts: { say: { voice: 'Samantha' } } } });
});

test('say provider: ignores player', async () => {
  const spawned = [];
  const mockSpawn = (cmd, args) => {
    spawned.push({ cmd, args });
    return {
      on(event, fn) {
        if (event === 'close') setImmediate(() => fn(0));
        return this;
      },
    };
  };

  const mockPlayer = { play: () => Promise.reject(new Error('should not be used')) };
  const provider = makeSayProvider({ spawn: mockSpawn });

  await provider.speak('test', {
    cfg: { tts: { say: { voice: 'Moira' } } },
    player: mockPlayer,
  });

  assert.equal(spawned.length, 1);
});

test('say provider: uses default voice if missing', async () => {
  const spawned = [];
  const mockSpawn = (cmd, args) => {
    spawned.push({ cmd, args });
    return {
      on(event, fn) {
        if (event === 'close') setImmediate(() => fn(0));
        return this;
      },
    };
  };

  const provider = makeSayProvider({ spawn: mockSpawn });
  await provider.speak('test', { cfg: { tts: { say: {} } } });

  assert.equal(spawned.length, 1);
  // Should use a sensible default (empty string or omit -v)
});

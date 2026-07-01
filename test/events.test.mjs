import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEventHub, makeStreamingLog, STREAM_EVENTS } from '../src/lib/events.mjs';

// A fake SSE response that records everything written to it.
function fakeRes() {
  return { written: [], write(s) { this.written.push(s); } };
}

test('broadcast writes an SSE frame to every client', () => {
  const hub = makeEventHub();
  const a = fakeRes(); const b = fakeRes();
  hub.add(a); hub.add(b);
  hub.broadcast('speak', { text: 'hi' });
  assert.equal(a.written[0], 'event: speak\ndata: {"text":"hi"}\n\n');
  assert.equal(b.written[0], a.written[0]);
  assert.equal(hub.size(), 2);
});

test('remove drops a client; a client whose write throws is dropped', () => {
  const hub = makeEventHub();
  const ok = fakeRes();
  const bad = { write() { throw new Error('closed'); } };
  hub.add(ok); hub.add(bad);
  hub.remove(ok);
  assert.equal(hub.size(), 1);
  hub.broadcast('toggle', { enabled: true }); // bad throws -> auto-dropped
  assert.equal(hub.size(), 0);
});

test('streaming log forwards only whitelisted events to the hub', () => {
  const hub = makeEventHub();
  const client = fakeRes(); hub.add(client);
  const baseCalls = [];
  const base = (level, event, fields) => baseCalls.push([level, event, fields]);
  const log = makeStreamingLog(base, hub, new Set(['toggle']));
  log('INFO', 'toggle', { enabled: false });
  log('INFO', 'speak', { text: 'x' }); // not whitelisted -> file only
  assert.equal(baseCalls.length, 2);            // base always called
  assert.equal(client.written.length, 1);       // only 'toggle' streamed
  assert.match(client.written[0], /^event: toggle\ndata: \{"ts":/);
  assert.ok(STREAM_EVENTS instanceof Set);
});

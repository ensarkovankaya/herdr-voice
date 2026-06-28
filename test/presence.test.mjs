import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidePresenceAction } from '../src/lib/presence.mjs';

const H = 30_000;
test('aktif & kayıtsız → register', () => {
  assert.equal(decidePresenceAction({ active: true, registered: false, lastRegisterMs: 0, now: 0, heartbeatMs: H }), 'register');
});
test('aktif & kayıtlı & heartbeat zamanı → register', () => {
  assert.equal(decidePresenceAction({ active: true, registered: true, lastRegisterMs: 0, now: 40_000, heartbeatMs: H }), 'register');
});
test('aktif & kayıtlı & taze → noop', () => {
  assert.equal(decidePresenceAction({ active: true, registered: true, lastRegisterMs: 0, now: 10_000, heartbeatMs: H }), 'noop');
});
test('pasif & kayıtlı → deregister', () => {
  assert.equal(decidePresenceAction({ active: false, registered: true, lastRegisterMs: 0, now: 0, heartbeatMs: H }), 'deregister');
});
test('pasif & kayıtsız → noop', () => {
  assert.equal(decidePresenceAction({ active: false, registered: false, lastRegisterMs: 0, now: 0, heartbeatMs: H }), 'noop');
});

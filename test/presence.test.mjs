import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidePresenceAction, pickTailscaleIp } from '../src/lib/presence.mjs';

const H = 30_000;

test('pickTailscaleIp picks the 100.64/10 CGNAT address', () => {
  const ifaces = {
    lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    en0: [{ family: 'IPv4', internal: false, address: '192.168.1.5' }],
    utun3: [{ family: 'IPv4', internal: false, address: '100.111.159.123' }],
  };
  assert.equal(pickTailscaleIp(ifaces), '100.111.159.123');
});

test('pickTailscaleIp returns empty when no Tailscale address', () => {
  assert.equal(pickTailscaleIp({ en0: [{ family: 'IPv4', internal: false, address: '10.0.0.2' }] }), '');
  assert.equal(pickTailscaleIp({}), '');
  assert.equal(pickTailscaleIp(null), '');
});
test('active & unregistered → register', () => {
  assert.equal(decidePresenceAction({ active: true, registered: false, lastRegisterMs: 0, now: 0, heartbeatMs: H }), 'register');
});
test('active & registered & heartbeat due → register', () => {
  assert.equal(decidePresenceAction({ active: true, registered: true, lastRegisterMs: 0, now: 40_000, heartbeatMs: H }), 'register');
});
test('active & registered & fresh → noop', () => {
  assert.equal(decidePresenceAction({ active: true, registered: true, lastRegisterMs: 0, now: 10_000, heartbeatMs: H }), 'noop');
});
test('inactive & registered → deregister', () => {
  assert.equal(decidePresenceAction({ active: false, registered: true, lastRegisterMs: 0, now: 0, heartbeatMs: H }), 'deregister');
});
test('inactive & unregistered → noop', () => {
  assert.equal(decidePresenceAction({ active: false, registered: false, lastRegisterMs: 0, now: 0, heartbeatMs: H }), 'noop');
});

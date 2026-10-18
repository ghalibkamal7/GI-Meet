import test from 'node:test';
import assert from 'node:assert/strict';
import { decideDeviceKeyAction } from '../src/features/chat/deviceKeyPolicy.ts';

const publicKey = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'x-coordinate', y: 'y-coordinate' });
const anotherPublicKey = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'other-x', y: 'other-y' });

test('creates a device key only before a public key has been registered', () => {
  assert.equal(decideDeviceKeyAction(false, null, null), 'create-initial-key');
  assert.equal(decideDeviceKeyAction(false, null, publicKey), 'restore-missing-key');
});

test('reuses or republishes only the key matching the registered public key', () => {
  assert.equal(decideDeviceKeyAction(true, publicKey, publicKey), 'use-local-key');
  assert.equal(decideDeviceKeyAction(true, publicKey, null), 'publish-local-key');
  assert.equal(decideDeviceKeyAction(true, publicKey, anotherPublicKey), 'resolve-key-mismatch');
  assert.equal(decideDeviceKeyAction(true, 'malformed', publicKey), 'resolve-key-mismatch');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseRegisteredPublicKey,
  decideDeviceKeyAction,
  publicKeysMatch,
} from '../src/features/chat/deviceKeyPolicy.ts';

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

test('initial public-key registration preserves the first key when devices race', () => {
  assert.deepEqual(chooseRegisteredPublicKey(null, publicKey), {
    publicKeyJwk: publicKey,
    shouldRegister: true,
  });
  assert.deepEqual(chooseRegisteredPublicKey(publicKey, anotherPublicKey), {
    publicKeyJwk: publicKey,
    shouldRegister: false,
  });
  assert.throws(() => chooseRegisteredPublicKey({ invalid: true }, anotherPublicKey), /invalid format/);
});

test('public-key matching ignores private JWK material and rejects coordinate mismatches', () => {
  const local = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'x-coordinate', y: 'y-coordinate', d: 'private' });
  assert.equal(publicKeysMatch(local, publicKey), true);
  assert.equal(publicKeysMatch(local, anotherPublicKey), false);
});

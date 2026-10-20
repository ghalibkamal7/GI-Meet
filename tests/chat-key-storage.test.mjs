import test from 'node:test';
import assert from 'node:assert/strict';
import { getPrivateKey } from '../src/services/secureKeyStore.ts';

test('web key-store access failures are propagated instead of treated as a missing key', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const storageFailure = new Error('IndexedDB unavailable');
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: { open() { throw storageFailure; } },
  });

  try {
    await assert.rejects(getPrivateKey('test-user'), (error) => error === storageFailure);
  } finally {
    if (originalDescriptor) Object.defineProperty(globalThis, 'indexedDB', originalDescriptor);
    else delete globalThis.indexedDB;
  }
});
